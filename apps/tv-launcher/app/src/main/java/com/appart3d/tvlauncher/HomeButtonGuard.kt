package com.appart3d.tvlauncher

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings

/**
 * Keeps HomeButtonService enabled: the TV drops it from the enabled accessibility services (app
 * update, firmware housekeeping), and the Home key then opens Google TV again. Needs
 * WRITE_SECURE_SETTINGS, granted once over ADB (`pm grant`, see README); a no-op without it.
 */
object HomeButtonGuard {
    fun ensure(context: Context) {
        if (context.checkSelfPermission("android.permission.WRITE_SECURE_SETTINGS") != PackageManager.PERMISSION_GRANTED) return
        val me = ComponentName(context, HomeButtonService::class.java).flattenToString()
        val cr = context.contentResolver
        val enabled = Settings.Secure.getString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        val list = enabled.split(':').filter { it.isNotBlank() }
        try {
            if (list.none { it.equals(me, ignoreCase = true) }) {
                Settings.Secure.putString(cr, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, (list + me).joinToString(":"))
            }
            if (Settings.Secure.getInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 0) != 1) {
                Settings.Secure.putInt(cr, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
            }
        } catch (_: SecurityException) {
        }
    }
}

/** After a reboot or an update of this app, before anyone presses Home. */
class HomeButtonGuardReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) = HomeButtonGuard.ensure(context)
}
