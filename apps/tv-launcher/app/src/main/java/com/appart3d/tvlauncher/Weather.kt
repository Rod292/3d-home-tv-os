package com.appart3d.tvlauncher

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/** Current weather at the configured place, straight from Open-Meteo (free, no key): works while the bridge sleeps. */
data class WeatherNow(val temperature: Int, val sky: Sky, val isDay: Boolean)

enum class Sky { CLEAR, PARTLY, CLOUDY, FOG, RAIN, SNOW, STORM }

object WeatherSource {
    /** Where to read the weather: set once over ADB (`--ef lat 48.85 --ef lon 2.35`, see README); none = no weather. */
    fun place(context: Context): Pair<Double, Double>? {
        val p = context.getSharedPreferences("weather", Context.MODE_PRIVATE)
        if (!p.contains("lat") || !p.contains("lon")) return null
        return p.getFloat("lat", 0f).toDouble() to p.getFloat("lon", 0f).toDouble()
    }

    fun setPlace(context: Context, lat: Double, lon: Double) {
        context.getSharedPreferences("weather", Context.MODE_PRIVATE).edit().putFloat("lat", lat.toFloat()).putFloat("lon", lon.toFloat()).apply()
    }

    private fun url(lat: Double, lon: Double) =
        "https://api.open-meteo.com/v1/forecast?latitude=$lat&longitude=$lon&current=temperature_2m,weather_code,is_day&timezone=auto"

    /** WMO weather interpretation code → sky. */
    fun skyOf(code: Int): Sky = when (code) {
        0 -> Sky.CLEAR
        1, 2 -> Sky.PARTLY
        3 -> Sky.CLOUDY
        45, 48 -> Sky.FOG
        in 51..67, in 80..82 -> Sky.RAIN
        in 71..77, 85, 86 -> Sky.SNOW
        in 95..99 -> Sky.STORM
        else -> Sky.CLOUDY
    }

    /** Blocking; null on any error (offline, API change). */
    fun fetch(lat: Double, lon: Double): WeatherNow? = runCatching {
        val c = URL(url(lat, lon)).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 8000
            c.readTimeout = 8000
            val cur = JSONObject(c.inputStream.bufferedReader().use { it.readText() }).getJSONObject("current")
            WeatherNow(cur.getDouble("temperature_2m").roundToInt(), skyOf(cur.getInt("weather_code")), cur.optInt("is_day", 1) == 1)
        } finally {
            c.disconnect()
        }
    }.getOrNull()
}

/**
 * Weather glyph in color, like Apple's multicolor SF Symbols: golden sun with a soft halo, ivory
 * moon, white clouds shading to blue-grey, blue drops, yellow bolt. Drawn in a 24-unit box.
 */
class WeatherIcon(context: Context) : View(context) {
    var weather: WeatherNow? = null
        set(v) {
            field = v
            invalidate()
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val clear = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
        style = Paint.Style.FILL_AND_STROKE
        strokeWidth = 2.6f
    }

    override fun onDraw(canvas: Canvas) {
        val w = weather ?: return
        val s = minOf(width, height) / 24f
        canvas.save()
        canvas.translate((width - 24 * s) / 2, (height - 24 * s) / 2)
        canvas.scale(s, s)
        val layer = canvas.saveLayer(-2f, -2f, 26f, 26f, null)
        when (w.sky) {
            Sky.CLEAR -> if (w.isDay) sun(canvas, 12f, 12f, 1f) else moon(canvas, 12f, 12f, 1f)
            Sky.PARTLY -> {
                if (w.isDay) sun(canvas, 8.5f, 8.5f, 0.68f) else moon(canvas, 8.5f, 8.5f, 0.68f)
                val c = cloud(2.5f, 3f)
                canvas.drawPath(c, clear)
                drawCloud(canvas, c, 3f)
            }
            Sky.CLOUDY -> drawCloud(canvas, cloud(0f, 1f), 1f)
            Sky.FOG -> {
                line.shader = null
                line.color = 0xD9E6EEF5.toInt()
                line.strokeWidth = 1.8f
                for ((i, x) in listOf(4f to 20f, 6f to 18f, 3f to 16f).withIndex()) canvas.drawLine(x.first, 8f + i * 4f, x.second, 8f + i * 4f, line)
            }
            Sky.RAIN -> {
                drawCloud(canvas, cloud(0f, -2.5f), -2.5f)
                line.shader = LinearGradient(0f, 17f, 0f, 22f, 0xFF7CCBFF.toInt(), 0xFF2F8FEA.toInt(), Shader.TileMode.CLAMP)
                line.strokeWidth = 1.8f
                for (x in listOf(8f, 12f, 16f)) canvas.drawLine(x, 17.2f, x - 1.4f, 21.5f, line)
            }
            Sky.SNOW -> {
                drawCloud(canvas, cloud(0f, -2.5f), -2.5f)
                paint.shader = null
                paint.color = Color.WHITE
                for ((x, y) in listOf(8f to 18.5f, 12f to 20.8f, 16f to 18.5f)) canvas.drawCircle(x, y, 1.35f, paint)
            }
            Sky.STORM -> {
                drawCloud(canvas, cloud(0f, -2.5f), -2.5f)
                val bolt = Path().apply {
                    moveTo(13.2f, 15f); lineTo(9.4f, 19.6f); lineTo(12f, 19.6f); lineTo(10.4f, 23.2f); lineTo(15.2f, 17.9f); lineTo(12.6f, 17.9f); close()
                }
                paint.shader = LinearGradient(0f, 15f, 0f, 23f, 0xFFFFE066.toInt(), 0xFFFFB800.toInt(), Shader.TileMode.CLAMP)
                canvas.drawPath(bolt, paint)
            }
        }
        canvas.restoreToCount(layer)
        canvas.restore()
    }

    private fun sun(canvas: Canvas, cx: Float, cy: Float, k: Float) {
        // Halo, rays, then the golden core.
        paint.shader = RadialGradient(cx, cy, 10f * k, 0x55FFC94A, 0x00FFC94A, Shader.TileMode.CLAMP)
        canvas.drawCircle(cx, cy, 10f * k, paint)
        line.shader = null
        line.color = 0xFFFFB83D.toInt()
        line.strokeWidth = 1.9f * k
        for (i in 0 until 8) {
            val a = i * Math.PI / 4
            canvas.drawLine(cx + (6.6f * k * cos(a)).toFloat(), cy + (6.6f * k * sin(a)).toFloat(), cx + (8.9f * k * cos(a)).toFloat(), cy + (8.9f * k * sin(a)).toFloat(), line)
        }
        paint.shader = RadialGradient(cx - 1.2f * k, cy - 1.2f * k, 5.2f * k, 0xFFFFEA8A.toInt(), 0xFFFFA91F.toInt(), Shader.TileMode.CLAMP)
        canvas.drawCircle(cx, cy, 4.6f * k, paint)
    }

    private fun moon(canvas: Canvas, cx: Float, cy: Float, k: Float) {
        val disc = Path().apply { addCircle(cx, cy, 7.5f * k, Path.Direction.CW) }
        disc.op(Path().apply { addCircle(cx + 4f * k, cy - 3f * k, 6.5f * k, Path.Direction.CW) }, Path.Op.DIFFERENCE)
        paint.shader = LinearGradient(cx - 7f * k, cy - 7f * k, cx + 5f * k, cy + 7f * k, 0xFFFFF8DC.toInt(), 0xFFE9D69B.toInt(), Shader.TileMode.CLAMP)
        canvas.drawPath(disc, paint)
    }

    private fun drawCloud(canvas: Canvas, path: Path, dy: Float) {
        paint.shader = LinearGradient(0f, 7f + dy, 0f, 19f + dy, Color.WHITE, 0xFFC9D6E3.toInt(), Shader.TileMode.CLAMP)
        canvas.drawPath(path, paint)
    }

    /** Cloud: three bumps on a flat base, offset by (dx, dy). */
    private fun cloud(dx: Float, dy: Float): Path {
        val p = Path().apply { addRoundRect(5f + dx, 13f + dy, 20f + dx, 19f + dy, 3f, 3f, Path.Direction.CW) }
        for ((x, y, r) in listOf(Triple(8.5f, 14.5f, 3.5f), Triple(13f, 12f, 5f), Triple(17.5f, 14.5f, 3f))) {
            p.op(Path().apply { addCircle(x + dx, y + dy, r, Path.Direction.CW) }, Path.Op.UNION)
        }
        return p
    }
}

/** Glyph + temperature + a short word ("☀︎ 14° · Ensoleillé"), refreshed every 15 min while on screen. Hidden until known. */
class WeatherView(context: Context, textSize: Float) : LinearLayout(context) {
    private val icon = WeatherIcon(context)
    private val temp = TextView(context)
    private val main = Handler(Looper.getMainLooper())
    private val refresh = object : Runnable {
        override fun run() {
            val place = WeatherSource.place(context) ?: return
            io.execute {
                val now = WeatherSource.fetch(place.first, place.second)
                main.post { now?.let(::show) }
            }
            main.postDelayed(this, if (icon.weather == null) 60_000L else 15 * 60_000L)
        }
    }

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        visibility = GONE
        val px = (textSize * resources.displayMetrics.scaledDensity * 1.3f).toInt()
        addView(icon, LayoutParams(px, px))
        addView(temp.apply {
            this.textSize = textSize
            setTextColor(0xD9FFFFFF.toInt())
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setShadowLayer(4f, 0f, 1f, 0x99000000.toInt())
            setPadding(0, px / 6, px / 6, px / 6)
        }, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { leftMargin = px / 3 })
    }

    private fun show(w: WeatherNow) {
        icon.weather = w
        temp.text = "${w.temperature}° · ${label(w)}"
        visibility = VISIBLE
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        main.removeCallbacks(refresh)
        main.post(refresh)
    }

    override fun onDetachedFromWindow() {
        main.removeCallbacks(refresh)
        super.onDetachedFromWindow()
    }

    companion object {
        private val io = Executors.newSingleThreadExecutor()

        fun label(w: WeatherNow): String = when (w.sky) {
            Sky.CLEAR -> if (w.isDay) "Ensoleillé" else "Dégagé"
            Sky.PARTLY -> "Éclaircies"
            Sky.CLOUDY -> "Nuageux"
            Sky.FOG -> "Brouillard"
            Sky.RAIN -> "Pluie"
            Sky.SNOW -> "Neige"
            Sky.STORM -> "Orage"
        }
    }
}
