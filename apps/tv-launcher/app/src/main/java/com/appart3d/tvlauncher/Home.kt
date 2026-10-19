package com.appart3d.tvlauncher

import android.graphics.Color
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.math.roundToInt

/**
 * A light (or a plug driving a lamp) of the home, as the bridge reports it. A ceiling fan with a
 * light is listed too, by its light only (`fanLight`: on / off; its speed stays out of the TV).
 */
data class Lamp(
    val id: String,
    val name: String,
    val room: String,
    val on: Boolean?,
    val reachable: Boolean,
    val color: Int?,
    val fanLight: Boolean = false,
    /** 1..100 for dimmable lights, null otherwise. */
    val brightness: Int? = null,
    /** Ceiling fan: motor speed step 0 (stopped) ..fanSteps, null for lamps. */
    val fanSpeed: Int? = null,
    val fanSteps: Int = 6,
) {
    companion object {
        private val KINDS = setOf("light", "plug")

        fun parse(d: JSONObject): Lamp? {
            val st = d.optJSONObject("state") ?: JSONObject()
            if (d.optString("kind") == "fan" && d.optJSONObject("capabilities")?.optBoolean("fanLight") == true) {
                val steps = d.optJSONObject("capabilities")?.optInt("speedSteps", 6)?.takeIf { it > 0 } ?: 6
                val running = st.optBoolean("on") && st.optInt("speed") > 0
                return Lamp(
                    id = d.getString("id"),
                    name = "Ventilateur",
                    room = d.optString("room"),
                    fanSpeed = if (running) (st.optInt("speed") * steps / 100.0).roundToInt().coerceIn(1, steps) else 0,
                    fanSteps = steps,
                    on = if (st.has("lightOn")) st.optBoolean("lightOn") else null,
                    reachable = st.optBoolean("reachable", true),
                    color = 0xFFFFE2B0.toInt(),
                    fanLight = true,
                )
            }
            if (d.optString("kind") !in KINDS) return null
            val color = st.optString("color").takeIf { it.startsWith("#") }?.let { runCatching { Color.parseColor(it) }.getOrNull() }
            val dimmable = d.optJSONObject("capabilities")?.optBoolean("brightness") == true && st.has("brightness")
            return Lamp(
                id = d.getString("id"),
                name = d.optString("name"),
                room = d.optString("room"),
                on = if (st.isNull("on")) null else st.optBoolean("on"),
                reachable = st.optBoolean("reachable", true),
                color = color,
                brightness = if (dimmable) st.optInt("brightness").coerceIn(1, 100) else null,
            )
        }
    }
}

/** A scene of the bridge (Lumineux, Cosy, Film, Nuit, Absent). */
data class Scene(val id: String, val name: String)

/**
 * Live lamps from the bridge's event stream (GET /api/home/events: a snapshot, then one event per
 * device change, from any source). Reconnects on its own; callbacks run on the feed thread.
 */
class HomeFeed(
    private val base: String,
    private val token: String,
    private val onLamps: (List<Lamp>) -> Unit,
    private val onLamp: (Lamp) -> Unit,
    /** Solar elevation (degrees) from each snapshot, null when the bridge has none. */
    private val onSun: (Double?) -> Unit = {},
    private val onScenes: (List<Scene>) -> Unit = {},
) {
    @Volatile private var running = false
    @Volatile private var conn: HttpURLConnection? = null
    private var thread: Thread? = null

    fun start() {
        if (running) return
        running = true
        thread = Thread(::loop, "home-feed").apply {
            isDaemon = true
            start()
        }
    }

    fun stop() {
        running = false
        conn?.disconnect()
        thread?.interrupt()
        thread = null
    }

    private fun loop() {
        while (running) {
            try {
                val c = URL("$base/api/home/events").openConnection() as HttpURLConnection
                conn = c
                c.connectTimeout = 5000
                c.readTimeout = 60_000 // the bridge pings every 25 s
                c.setRequestProperty("authorization", "Bearer $token")
                c.setRequestProperty("accept", "text/event-stream")
                if (c.responseCode != 200) throw IOException("réponse ${c.responseCode}")
                c.inputStream.bufferedReader().use { r ->
                    val data = StringBuilder()
                    while (running) {
                        val line = r.readLine() ?: break
                        if (line.startsWith("data:")) {
                            data.append(line.substring(5).trimStart())
                        } else if (line.isEmpty() && data.isNotEmpty()) {
                            handle(data.toString())
                            data.setLength(0)
                        }
                    }
                }
            } catch (_: Exception) {
                // Bridge restarting or Wi-Fi hiccup: retry below.
            }
            if (!running) return
            try {
                Thread.sleep(5000)
            } catch (_: InterruptedException) {
                return
            }
        }
    }

    private fun handle(json: String) {
        val ev = runCatching { JSONObject(json) }.getOrNull() ?: return
        when (ev.optString("type")) {
            "snapshot" -> {
                val snapshot = ev.optJSONObject("snapshot") ?: return
                onSun(snapshot.optJSONObject("sun")?.optDouble("elevation")?.takeIf { !it.isNaN() })
                snapshot.optJSONArray("scenes")?.let { a ->
                    onScenes((0 until a.length()).map { a.getJSONObject(it) }.map { Scene(it.getString("id"), it.optString("name")) })
                }
                val devices = snapshot.optJSONArray("devices") ?: return
                onLamps((0 until devices.length()).mapNotNull { Lamp.parse(devices.getJSONObject(it)) })
            }
            "device" -> ev.optJSONObject("device")?.let(Lamp::parse)?.let(onLamp)
        }
    }

    companion object {
        /** Power (or fanLight for a fan) → the updated lamp. Throws on errors. */
        fun power(base: String, token: String, lamp: Lamp, on: Boolean): Lamp? =
            action(base, token, lamp, JSONObject().put("type", if (lamp.fanLight) "fanLight" else "power").put("on", on))

        /** Brightness 1..100 (the bridge turns the light on) → the updated lamp. Throws on errors. */
        fun brightness(base: String, token: String, lamp: Lamp, value: Int): Lamp? =
            action(base, token, lamp, JSONObject().put("type", "brightness").put("value", value))

        /** Fan motor speed step (0 = stop) → the updated fan. Throws on errors. */
        fun fanSpeed(base: String, token: String, lamp: Lamp, step: Int): Lamp? =
            action(base, token, lamp, JSONObject().put("type", "speed").put("value", if (step <= 0) 0 else (step * 100.0 / lamp.fanSteps).roundToInt()))

        /** POST /api/home/scenes/:id (changes come back through the event stream). Throws on errors. */
        fun scene(base: String, token: String, id: String) {
            post(base, token, "/api/home/scenes/${URLEncoder.encode(id, "UTF-8")}", JSONObject())
        }

        private fun action(base: String, token: String, lamp: Lamp, action: JSONObject): Lamp? =
            Lamp.parse(post(base, token, "/api/home/devices/${URLEncoder.encode(lamp.id, "UTF-8")}/action", action))

        private fun post(base: String, token: String, path: String, body: JSONObject): JSONObject {
            val c = URL("$base$path").openConnection() as HttpURLConnection
            try {
                c.connectTimeout = 5000
                c.readTimeout = 10_000
                c.requestMethod = "POST"
                c.doOutput = true
                c.setRequestProperty("authorization", "Bearer $token")
                c.setRequestProperty("content-type", "application/json")
                c.outputStream.use { it.write(body.toString().toByteArray()) }
                if (c.responseCode != 200) throw IOException("réponse ${c.responseCode}")
                return JSONObject(c.inputStream.bufferedReader().use { it.readText() })
            } finally {
                c.disconnect()
            }
        }
    }
}
