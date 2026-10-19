package com.appart3d.tvlauncher

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.URL

/** Bridge address and access token, kept across restarts. */
class BridgeStore(context: Context) {
    private val prefs = context.getSharedPreferences("bridge", Context.MODE_PRIVATE)

    var url: String?
        get() = prefs.getString("url", null)
        set(v) = prefs.edit().putString("url", v).apply()

    var token: String?
        get() = prefs.getString("token", null)
        set(v) = prefs.edit().putString("token", v).apply()
}

/** Finds the home bridge on the Wi-Fi (Bonjour `_appart3d._tcp`, like the iPhone app). */
class BridgeDiscovery(context: Context, private val onFound: (String) -> Unit) {
    private val nsd = context.getSystemService(NsdManager::class.java)
    private val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private var lock: WifiManager.MulticastLock? = null
    private var listener: NsdManager.DiscoveryListener? = null

    fun start() {
        if (listener != null || nsd == null) return
        lock = wifi?.createMulticastLock("maison-bonjour")?.apply {
            setReferenceCounted(false)
            acquire()
        }
        val l = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                listener = null
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onServiceLost(info: NsdServiceInfo) {}
            override fun onServiceFound(info: NsdServiceInfo) = resolve(info)
        }
        listener = l
        try {
            nsd.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, l)
        } catch (_: RuntimeException) {
            listener = null
        }
    }

    fun stop() {
        listener?.let {
            try {
                nsd?.stopServiceDiscovery(it)
            } catch (_: RuntimeException) {
            }
        }
        listener = null
        lock?.release()
        lock = null
    }

    @Suppress("DEPRECATION") // resolveService: fine for a single service, and available on every TV.
    private fun resolve(info: NsdServiceInfo) {
        nsd?.resolveService(info, object : NsdManager.ResolveListener {
            override fun onResolveFailed(i: NsdServiceInfo, errorCode: Int) {}
            override fun onServiceResolved(i: NsdServiceInfo) {
                // IPv4 only: the auth cookie and the WebView handle a plain host best.
                val host = (i.host as? Inet4Address)?.hostAddress ?: return
                main.post { onFound("http://$host:${i.port}") }
            }
        })
    }

    companion object {
        const val SERVICE_TYPE = "_appart3d._tcp."
    }
}

object BridgeApi {
    /** POST /api/pair {code, deviceName} → access token, or null when the code is wrong. Throws on network errors. */
    fun pair(base: String, code: String, deviceName: String): String? {
        val conn = URL("$base/api/pair").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 5000
            conn.readTimeout = 8000
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("content-type", "application/json")
            val body = JSONObject().put("code", code).put("deviceName", deviceName).toString()
            conn.outputStream.use { it.write(body.toByteArray()) }
            return when (val status = conn.responseCode) {
                200 -> JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).getString("token")
                401 -> null
                429 -> throw IOException("trop d'essais, réessayez plus tard")
                else -> throw IOException("réponse $status")
            }
        } finally {
            conn.disconnect()
        }
    }
}
