package com.appart3d.tvlauncher

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.KeyEvent
import android.view.animation.LinearInterpolator
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.sign

/**
 * "Lumières" panel left of the 3D, a small tvOS-like control center on frosted glass: scene pills
 * ("Tout éteindre", Lumineux, Cosy…), then the lamps — OK toggles, ← / → dims (10 % steps).
 * Apple TV look: the focused row or pill turns white with dark text.
 */
class LightsPanel(
    context: Context,
    private val onToggle: (Lamp) -> Unit,
    private val onBrightness: (Lamp, Int) -> Unit,
    private val onFanSpeed: (Lamp, Int) -> Unit,
    /** The selected lamp (null: none), shown in the 3D before it is toggled. */
    private val onSpotlight: (Lamp?) -> Unit,
    private val onScene: (Scene) -> Unit,
    private val onAllOff: () -> Unit,
) : LinearLayout(context) {
    private val subtitle = TextView(context)
    private val pills = LinearLayout(context)
    private val list = LinearLayout(context)
    private val rows = LinkedHashMap<String, Row>()
    private var sceneIds: List<String> = emptyList()

    init {
        orientation = VERTICAL
        background = Glass(dp(28).toFloat(), dp(1.5f).toFloat())
        setPadding(dp(8), dp(18), dp(8), dp(12))
        addView(TextView(context).apply {
            text = context.getString(R.string.lights_title)
            setTextColor(Color.WHITE)
            textSize = 20f
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            setPadding(dp(14), 0, dp(14), 0)
        })
        addView(subtitle.apply {
            setTextColor(0x99FFFFFF.toInt())
            textSize = 13f
            setPadding(dp(14), dp(2), dp(14), dp(4))
        })
        pills.orientation = HORIZONTAL
        pills.clipChildren = false
        pills.clipToPadding = false
        pills.setPadding(dp(10), dp(8), dp(10), dp(8))
        addView(HorizontalScrollView(context).apply {
            isHorizontalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isHorizontalFadingEdgeEnabled = true
            setFadingEdgeLength(dp(16))
            isFocusable = false
            addView(pills)
        }, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        setScenes(emptyList())
        list.orientation = VERTICAL
        list.clipChildren = false
        list.clipToPadding = false
        list.setPadding(dp(10), dp(6), dp(10), dp(6))
        addView(ScrollView(context).apply {
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalFadingEdgeEnabled = true
            setFadingEdgeLength(dp(24))
            // Clipped (rows must not scroll over the title); the list padding leaves room for the focus zoom.
            isFocusable = false
            addView(list)
        }, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }

    /** Scenes that keep the TV on, plus "Nuit" (bedtime); "Absent" turns the TV off too: not offered here. */
    fun setScenes(scenes: List<Scene>) {
        val shown = scenes.filter { it.id in TV_SCENES }
        if (shown.map { it.id } == sceneIds && pills.childCount > 0) return
        sceneIds = shown.map { it.id }
        pills.removeAllViews()
        addPill(context.getString(R.string.all_off), onAllOff)
        for (scene in shown) addPill(scene.name) { onScene(scene) }
    }

    private fun addPill(label: String, onClick: () -> Unit) {
        val pill = TextView(context).apply {
            text = label
            textSize = 13f
            gravity = Gravity.CENTER
            isFocusable = true
            setPadding(dp(14), 0, dp(14), 0)
            setOnClickListener { onClick() }
        }
        val paint = { focused: Boolean ->
            pill.background = GradientDrawable().apply {
                cornerRadius = dp(17).toFloat()
                setColor(if (focused) 0xF2FFFFFF.toInt() else 0x26FFFFFF)
            }
            pill.setTextColor(if (focused) 0xFF111111.toInt() else Color.WHITE)
        }
        paint(false)
        pill.setOnFocusChangeListener { v, f ->
            paint(f)
            v.animate().scaleX(if (f) 1.08f else 1f).scaleY(if (f) 1.08f else 1f).setDuration(140).start()
        }
        pills.addView(pill, LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(34)).apply { if (pills.childCount > 0) leftMargin = dp(8) })
    }

    fun setLamps(lamps: List<Lamp>) {
        if (lamps.map { it.id } != rows.keys.toList()) {
            val focusedId = rows.entries.firstOrNull { it.value.view.hasFocus() }?.key
            list.removeAllViews()
            rows.values.forEach { it.stop() }
            rows.clear()
            for (lamp in lamps) {
                val row = Row(lamp)
                rows[lamp.id] = row
                list.addView(row.view, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58)).apply { bottomMargin = dp(6) })
            }
            focusedId?.let { rows[it]?.view?.requestFocus() }
        } else {
            lamps.forEach { rows[it.id]?.bind(it) }
        }
        updateSubtitle()
    }

    /** Current lamps, as shown. */
    fun lamps(): List<Lamp> = rows.values.map { it.lamp }

    fun update(lamp: Lamp) {
        rows[lamp.id]?.bind(lamp) ?: return
        updateSubtitle()
    }

    private fun updateSubtitle() {
        val on = rows.values.count { it.lamp.on == true }
        subtitle.text = when {
            rows.isEmpty() -> context.getString(R.string.no_lamp)
            on == 0 -> context.getString(R.string.all_lights_off)
            else -> resources.getQuantityString(R.plurals.lights_on, on, on)
        }
    }

    private inner class Row(var lamp: Lamp) {
        private val dot = ImageView(context).apply {
            setImageResource(R.drawable.ic_bulb)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            setPadding(dp(7), dp(7), dp(7), dp(7))
        }
        private val name = TextView(context)
        private val room = TextView(context)
        private val track = FrameLayout(context)
        /** Brightness of a lit dimmable lamp: a thin bar under its name. */
        private val level = View(context)
        private val levelTrack = FrameLayout(context)
        private val knob = View(context)
        private var focused = false
        /** Fan glyph spinning at a pace that follows the speed step (null while still). */
        private var spinner: ObjectAnimator? = null
        private var spinStep = -1

        val view: LinearLayout = LinearLayout(context).apply {
            orientation = HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            isFocusable = true
            setPadding(dp(12), 0, dp(12), 0)
            addView(dot, LayoutParams(dp(32), dp(32)))
            addView(LinearLayout(context).apply {
                orientation = VERTICAL
                addView(name.apply {
                    textSize = 15f
                    maxLines = 1
                    ellipsize = TextUtils.TruncateAt.END
                })
                addView(room.apply {
                    textSize = 12f
                    maxLines = 1
                })
                levelTrack.addView(level, FrameLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT))
                addView(levelTrack, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { topMargin = dp(4) })
            }, LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = dp(12)
                rightMargin = dp(8)
            })
            track.addView(knob, FrameLayout.LayoutParams(dp(18), dp(18), Gravity.CENTER_VERTICAL).apply { leftMargin = dp(3) })
            addView(track, LayoutParams(dp(42), dp(24)))
            setOnClickListener { if (lamp.reachable && lamp.on != null) onToggle(lamp) }
            setOnKeyListener { _, keyCode, event ->
                val step = when (keyCode) {
                    KeyEvent.KEYCODE_DPAD_RIGHT -> 10
                    KeyEvent.KEYCODE_DPAD_LEFT -> -10
                    else -> return@setOnKeyListener false
                }
                lamp.fanSpeed?.let { speed ->
                    // Ceiling fan: ← / → change the motor speed (0 = stopped); OK stays for its light.
                    val next = (speed + step.sign).coerceIn(0, lamp.fanSteps)
                    if (event.action == KeyEvent.ACTION_DOWN && lamp.reachable && next != speed) onFanSpeed(lamp, next)
                    return@setOnKeyListener true
                }
                val b = lamp.brightness ?: return@setOnKeyListener false
                if (event.action == KeyEvent.ACTION_DOWN && lamp.reachable && lamp.on != null) {
                    // Off: → lights it at its last level; on: dims within 1..100 (never switches it off).
                    val next = if (lamp.on != true) (if (step > 0) b else return@setOnKeyListener true) else (b + step).coerceIn(1, 100)
                    onBrightness(lamp, next)
                }
                true
            }
            setOnFocusChangeListener { v, f ->
                focused = f
                v.animate().scaleX(if (f) 1.05f else 1f).scaleY(if (f) 1.05f else 1f).translationZ(if (f) dp(10).toFloat() else 0f).setDuration(160).start()
                paint()
                if (f) onSpotlight(lamp)
                // Left for another row: that row reports itself; left the lamps: nothing selected.
                else v.post { if (rows.values.none { it.view.hasFocus() }) onSpotlight(null) }
            }
        }

        init {
            knob.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
            }
            bind(lamp)
        }

        fun bind(l: Lamp) {
            lamp = l
            name.text = l.name
            dot.setImageResource(if (l.fanSpeed != null) R.drawable.ic_fan else R.drawable.ic_bulb)
            if (l.fanSpeed != null) spin(l.fanSpeed)
            room.text = when {
                !l.reachable || l.on == null -> context.getString(R.string.unreachable)
                l.fanSpeed != null -> if (l.fanSpeed > 0) context.getString(R.string.fan_speed, l.room, l.fanSpeed) else context.getString(R.string.fan_stopped, l.room)
                l.on == true && l.brightness != null -> context.getString(R.string.room_brightness, l.room, l.brightness)
                else -> l.room
            }
            val fraction = when {
                l.fanSpeed != null -> l.fanSpeed.toFloat() / l.fanSteps
                l.on == true && l.brightness != null -> l.brightness / 100f
                else -> 0f
            }
            // The fan keeps an empty bar when stopped: it shows that → speeds it up.
            levelTrack.visibility = if (fraction > 0f || l.fanSpeed != null) View.VISIBLE else View.GONE
            levelTrack.post {
                level.layoutParams = level.layoutParams.apply { width = (levelTrack.width * fraction).toInt() }
            }
            view.alpha = if (l.reachable && l.on != null) 1f else 0.45f
            knob.animate().translationX(if (l.on == true) dp(18).toFloat() else 0f).setDuration(160).start()
            paint()
        }

        fun stop() {
            spinner?.cancel()
            spinner = null
        }

        private fun spin(step: Int) {
            if (step == spinStep) return
            spinStep = step
            spinner?.cancel()
            spinner = null
            if (step <= 0) {
                dot.animate().rotation(0f).setDuration(400).start()
                return
            }
            // One turn in 2 s at speed 1, down to 0.5 s at speed 6.
            val period = (2000 - (step - 1) * 300).toLong()
            spinner = ObjectAnimator.ofFloat(dot, View.ROTATION, dot.rotation % 360f, dot.rotation % 360f + 360f).apply {
                duration = period
                repeatCount = ValueAnimator.INFINITE
                interpolator = LinearInterpolator()
                start()
            }
        }

        private fun paint() {
            val on = lamp.on == true
            dot.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(if (on) lamp.color ?: 0xFFFFD27A.toInt() else if (focused) 0x14000000 else 0x24FFFFFF)
            }
            dot.setColorFilter(if (on) 0xB3000000.toInt() else if (focused) 0x8C000000.toInt() else 0xB3FFFFFF.toInt())
            view.background = if (focused) GradientDrawable().apply {
                cornerRadius = dp(16).toFloat()
                setColor(0xF2FFFFFF.toInt())
            } else null
            name.setTextColor(if (focused) 0xFF111111.toInt() else Color.WHITE)
            levelTrack.background = GradientDrawable().apply {
                cornerRadius = dp(2).toFloat()
                setColor(if (focused) 0x1F000000 else 0x26FFFFFF)
            }
            level.background = GradientDrawable().apply {
                cornerRadius = dp(2).toFloat()
                setColor(if (focused) 0xFF111111.toInt() else lamp.color ?: Color.WHITE)
            }
            room.setTextColor(if (focused) 0x99111111.toInt() else 0x99FFFFFF.toInt())
            track.background = GradientDrawable().apply {
                cornerRadius = dp(12).toFloat()
                setColor(if (on) 0xFF34C759.toInt() else if (focused) 0x33000000 else 0x40FFFFFF)
            }
        }
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
    private fun dp(v: Float): Int = (v * resources.displayMetrics.density).toInt()

    companion object {
        private val TV_SCENES = setOf("bright", "cozy", "movie", "night")
    }
}
