package com.appart3d.tvlauncher

import android.content.Context
import android.content.Intent
import android.graphics.drawable.Drawable

data class TvApp(val pkg: String, val label: String, val banner: Drawable?, val icon: Drawable?)

/**
 * The dock: only the apps listed (by the label the TV shows), in that order; the others stay installed,
 * just hidden. Set over ADB with `--es dock "YouTube,Netflix,…"` (see README); DEFAULT_DOCK otherwise.
 */
class AppCatalog(private val context: Context) {
    private val pm = context.packageManager
    private val prefs = context.getSharedPreferences("dock", Context.MODE_PRIVATE)

    fun setDock(labels: List<String>) {
        prefs.edit().putString("labels", labels.joinToString("\n")).apply()
    }

    private fun dock(): List<List<String>> {
        val saved = prefs.getString("labels", null)?.split("\n")?.filter { it.isNotBlank() }
        return saved?.map { label -> ALIASES.firstOrNull { it.any { a -> a.equals(label, ignoreCase = true) } } ?: listOf(label) } ?: DEFAULT_DOCK
    }

    fun load(): List<TvApp> {
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
        val installed = pm.queryIntentActivities(intent, 0)
            .filter { it.activityInfo.packageName != context.packageName }
            .map { ri ->
                val ai = ri.activityInfo
                TvApp(ai.packageName, ri.loadLabel(pm).toString(), ai.loadBanner(pm) ?: ai.applicationInfo.loadBanner(pm), ri.loadIcon(pm))
            }
        return dock().mapNotNull { names -> installed.firstOrNull { app -> names.any { it.equals(app.label.trim(), ignoreCase = true) } } }
    }

    fun launchIntent(pkg: String): Intent? =
        (pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg))?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    companion object {
        /** Different labels for the same app across TVs and regions. */
        private val ALIASES = listOf(
            listOf("Canal+", "myCANAL", "CANAL+"),
            listOf("Prime Video", "Amazon Prime Video"),
            listOf("Disney+", "Disney Plus"),
            listOf("YouTube"),
            listOf("Netflix"),
        )

        private val DEFAULT_DOCK = listOf(
            listOf("YouTube"), listOf("Netflix"), listOf("Prime Video", "Amazon Prime Video"), listOf("Disney+", "Disney Plus"),
            listOf("Spotify"), listOf("Plex"), listOf("Twitch"), listOf("Apple TV"),
        )
    }
}
