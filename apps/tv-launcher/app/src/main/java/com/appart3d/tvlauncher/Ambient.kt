package com.appart3d.tvlauncher

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.drawable.Drawable

/**
 * Home screen background: soft color blobs on a deep base (tvOS-like mesh gradient), following the
 * sun from the bridge. Same palettes as apps/web/src/lib/launcherLook.ts (the 3D TV mirrors this screen).
 */
class Ambient private constructor(private val base: IntArray, private val blobs: List<Blob>) : Drawable() {
    private class Blob(val x: Float, val y: Float, val r: Float, val color: Int, val alpha: Float)

    private val basePaint = Paint()
    private val blobPaints = blobs.map { Paint(Paint.ANTI_ALIAS_FLAG) }

    override fun onBoundsChange(bounds: Rect) {
        val w = bounds.width().toFloat()
        val h = bounds.height().toFloat()
        basePaint.shader = LinearGradient(0f, 0f, 0f, h, base[0], base[1], Shader.TileMode.CLAMP)
        blobs.forEachIndexed { i, b ->
            val c = Color.argb((b.alpha * 255).toInt(), Color.red(b.color), Color.green(b.color), Color.blue(b.color))
            blobPaints[i].shader = RadialGradient(b.x * w, b.y * h, b.r * w, c, c and 0x00FFFFFF, Shader.TileMode.CLAMP)
        }
    }

    override fun draw(canvas: Canvas) {
        val r = bounds
        canvas.drawRect(r, basePaint)
        for (p in blobPaints) canvas.drawRect(r, p)
    }

    override fun setAlpha(alpha: Int) {}
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.OPAQUE

    companion object {
        private fun c(hex: String) = Color.parseColor(hex)

        private val NIGHT = Ambient(
            intArrayOf(c("#0b1026"), c("#04050d")),
            listOf(Blob(0.12f, 0.18f, 0.55f, c("#3b2a8f"), 0.55f), Blob(0.88f, 0.12f, 0.5f, c("#0f4f7d"), 0.5f), Blob(0.62f, 1f, 0.6f, c("#6a2b70"), 0.38f), Blob(0.25f, 0.9f, 0.45f, c("#12386a"), 0.45f)),
        )

        /** Palette for a solar elevation in degrees (null: unknown → day). New drawable each call. */
        fun forSun(elevation: Double?): Ambient = when {
            elevation == null || elevation >= 8 -> Ambient(
                intArrayOf(c("#1e3a64"), c("#0b1626")),
                listOf(Blob(0.15f, 0.12f, 0.55f, c("#4f86d6"), 0.55f), Blob(0.85f, 0.18f, 0.45f, c("#f2a46b"), 0.38f), Blob(0.65f, 1f, 0.55f, c("#2a9d8f"), 0.35f), Blob(0.1f, 0.92f, 0.45f, c("#6d5bd0"), 0.32f)),
            )
            elevation >= -4 -> Ambient(
                intArrayOf(c("#2a2350"), c("#0c0a1a")),
                listOf(Blob(0.82f, 0.2f, 0.55f, c("#ff8a5b"), 0.5f), Blob(0.15f, 0.15f, 0.5f, c("#5b4bc4"), 0.5f), Blob(0.55f, 1f, 0.6f, c("#c2477a"), 0.35f), Blob(0.1f, 0.9f, 0.4f, c("#1f3f7a"), 0.4f)),
            )
            else -> Ambient(NIGHT.base, NIGHT.blobs)
        }

        /** Palette name, to redraw only when it changes. */
        fun key(elevation: Double?): String = when {
            elevation == null || elevation >= 8 -> "day"
            elevation >= -4 -> "golden"
            else -> "night"
        }
    }
}
