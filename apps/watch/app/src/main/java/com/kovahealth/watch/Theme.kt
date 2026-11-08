package com.kovahealth.watch

import androidx.compose.ui.graphics.Color

/**
 * Nocturno Vital tokens for Wear OS (docs/design/tokens.json). The names match the constants
 * MainActivity already used; Crit, Track, Accent400, Accent700 and Accent700Pressed are new.
 */
internal object KovaWatchTheme {
    val Bg = Color(0xFF000000)          // OLED: true black, as watch faces do
    val Surface = Color(0xFF292B31)     // neutral-900, secondary controls
    val TextC = Color(0xFFE9E9ED)
    val Accent = Color(0xFF9184D9)      // strokes and progress, never text on Surface
    val Accent100 = Color(0xFFF5F4FF)
    val Accent300 = Color(0xFFD2CEFD)
    val Accent400 = Color(0xFFB5ABFC)   // violet text
    val Accent700 = Color(0xFF5D5294)   // primary action fill, white text on it
    val Accent700Pressed = Color(0xFF4E457E)
    val N400 = Color(0xFFB2B6CA)
    val N500 = Color(0xFF9397AB)        // smallest text colour
    val N800 = Color(0xFF3F424D)
    val Divider = Color(0x29E9E9ED)
    val Track = Color(0xFF3A3466)       // rest ring track
    val Ok = Color(0xFF6FD6A3)
    val Warn = Color(0xFFEFC173)
    val Crit = Color(0xFFF08A78)
    val White = Color(0xFFFFFFFF)
}
