package com.appart3d.tvlauncher

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent

/**
 * Google TV ignores the preferred home app and setupwraith re-enables its launcher when disabled
 * (Home then loops), so the stock launcher stays installed and this service takes over:
 *  - the Home key of the remote opens Maison instead;
 *  - if the Google TV home still shows up (boot, other paths), Maison replaces it at once.
 * Only events from the stock launcher are delivered (packageNames in the service config).
 */
class HomeButtonService : AccessibilityService() {
    override fun onServiceConnected() {
        super.onServiceConnected()
        CrashGuard.install(this)
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_HOME) return false
        // Maison keeps crashing: let the stock home answer the Home key (CrashGuard).
        if (CrashGuard.crashLooping(this)) return false
        if (event.action == KeyEvent.ACTION_UP && !event.isCanceled) openHome()
        return true
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && event.packageName == STOCK_HOME && !CrashGuard.crashLooping(this)) openHome()
    }

    override fun onInterrupt() {}

    private fun openHome() {
        startActivity(
            Intent(this, MainActivity::class.java)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_HOME)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED),
        )
    }

    companion object {
        private const val STOCK_HOME = "com.google.android.apps.tv.launcherx"
    }
}
