package com.appart3d.tvlauncher

import android.content.Context

/**
 * Remembers recent crashes of the app. If it keeps crashing (3 within 2 minutes), the Home key service
 * stops taking over and the stock Google TV home shows again — a broken build must never leave the TV
 * without a working home screen. It takes over again once the app has run 2 minutes without crashing.
 */
object CrashGuard {
    private const val PREFS = "crash_guard"
    private const val WINDOW_MS = 2 * 60_000L
    private const val LIMIT = 3

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        if (previous is Recorder) return
        Thread.setDefaultUncaughtExceptionHandler(Recorder(app, previous))
    }

    fun crashLooping(context: Context, now: Long = System.currentTimeMillis()): Boolean =
        recent(context, now).size >= LIMIT

    private fun recent(context: Context, now: Long): List<Long> =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("times", "").orEmpty()
            .split(',').mapNotNull(String::toLongOrNull).filter { now - it < WINDOW_MS }

    private class Recorder(private val app: Context, private val previous: Thread.UncaughtExceptionHandler?) : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(t: Thread, e: Throwable) {
            runCatching {
                val now = System.currentTimeMillis()
                val times = (recent(app, now) + now).takeLast(LIMIT + 2).joinToString(",")
                // commit, not apply: the process is about to die.
                app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("times", times).commit()
            }
            previous?.uncaughtException(t, e)
        }
    }
}
