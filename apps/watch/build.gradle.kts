// Versions match apps/mobile (React Native 0.88: AGP 9.2.1, Kotlin 2.2.0) so one Gradle/JDK setup builds both.
plugins {
    id("com.android.application") version "9.2.1" apply false
    id("org.jetbrains.kotlin.android") version "2.2.0" apply false
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.0" apply false
}
