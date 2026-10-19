package com.appart3d.tvlauncher

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable

/**
 * "Liquid glass" surface: a translucent tinted fill, a specular glow in the top-left corner and a
 * rim that is bright at the top and fades downward (light caught by the glass edge).
 * With `fill = 0` it is only the sheen + rim, used over app banners when focused.
 */
class Glass(
    private val radius: Float,
    private val rimWidth: Float,
    private val fillTop: Int = 0x2EFFFFFF,
    private val fillBottom: Int = 0x12FFFFFF,
    private val sheen: Int = 0x33FFFFFF,
    private val rimTop: Int = 0x8CFFFFFF.toInt(),
    private val rimBottom: Int = 0x1AFFFFFF,
) : Drawable() {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glow = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rim = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = rimWidth
    }
    private val rect = RectF()
    private val path = Path()

    override fun onBoundsChange(bounds: Rect) {
        rect.set(bounds)
        rect.inset(rimWidth / 2, rimWidth / 2)
        path.reset()
        path.addRoundRect(rect, radius, radius, Path.Direction.CW)
        val h = rect.height()
        fill.shader = LinearGradient(0f, rect.top, 0f, rect.bottom, fillTop, fillBottom, Shader.TileMode.CLAMP)
        glow.shader = RadialGradient(rect.left + rect.width() * 0.2f, rect.top, maxOf(rect.width(), h) * 0.75f, sheen, sheen and 0x00FFFFFF, Shader.TileMode.CLAMP)
        rim.shader = LinearGradient(0f, rect.top, 0f, rect.top + minOf(h, radius * 4), rimTop, rimBottom, Shader.TileMode.CLAMP)
    }

    override fun draw(canvas: Canvas) {
        if (Color.alpha(fillTop) > 0 || Color.alpha(fillBottom) > 0) canvas.drawPath(path, fill)
        canvas.save()
        canvas.clipPath(path)
        canvas.drawRect(rect, glow)
        canvas.restore()
        canvas.drawPath(path, rim)
    }

    override fun setAlpha(alpha: Int) {}
    override fun setColorFilter(colorFilter: ColorFilter?) {}
    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
