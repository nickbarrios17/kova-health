package com.kovahealth.watch

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import kotlin.math.roundToInt

// Tokens from design/prototypes/nocturne.css + the watch prototype (VIDA Watch v2).
private val Bg = Color(0xFF000000)          // OLED: true black, as watch faces do
private val Surface = Color(0xFF292B31)     // neutral-900
private val TextC = Color(0xFFE9E9ED)
private val Accent = Color(0xFF9184D9)
private val Accent100 = Color(0xFFF5F4FF)
private val Accent300 = Color(0xFFD2CEFD)
private val N400 = Color(0xFFB2B6CA)
private val N500 = Color(0xFF9397AB)
private val N800 = Color(0xFF3F424D)
private val Divider = Color(0x29E9E9ED)
private val Ok = Color(0xFF6FD6A3)
private val Warn = Color(0xFFEFC173)
private const val LB = 2.20462

private sealed interface Screen {
    data object Login : Screen
    data object Home : Screen
    data object Workout : Screen
    data object Edit : Screen
    data object Mood : Screen
    data class Done(val sets: Int, val volumeKg: Double) : Screen
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) // the active set stays visible in the gym
        val store = Store(this)
        val api = KovaApi(store)
        setContent { KovaWatch(store, api) }
    }
}

internal data class Routine(val id: String, val name: String, val days: List<Int>, val items: JSONArray)

@Composable
private fun KovaWatch(store: Store, api: KovaApi) {
    val scope = rememberCoroutineScope()
    var screen by remember { mutableStateOf<Screen>(if (store.signedIn) Screen.Home else Screen.Login) }
    var live by remember { mutableStateOf(store.live) }
    var routines by remember { mutableStateOf<List<Routine>>(emptyList()) }
    var names by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var lastKg by remember { mutableStateOf<Map<String, Double>>(emptyMap()) }
    var pending by remember { mutableStateOf(store.pendingCount) }
    var offline by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var unit by remember { mutableStateOf(store.unit) }
    val context = LocalContext.current
    val heart = remember { HeartRate(context) }
    var bpm by remember { mutableStateOf<Int?>(null) }
    val askHr = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    fun save(l: Live?) { live = l; store.live = l }
    fun sync() = scope.launch(Dispatchers.IO) {
        val left = runCatching { store.flush(api) }.getOrElse { store.pendingCount }
        withContext(Dispatchers.Main) { pending = left; offline = left > 0 }
    }
    fun queue(fn: String, params: JSONObject) { store.enqueue(fn, params); pending = store.pendingCount; sync() }

    LaunchedEffect(Unit) { while (true) { now = System.currentTimeMillis(); delay(1000) } }
    LaunchedEffect(Unit) { while (true) { delay(30_000); if (store.pendingCount > 0) sync() } }

    LaunchedEffect(screen == Screen.Home) {
        if (screen != Screen.Home || !store.signedIn) return@LaunchedEffect
        withContext(Dispatchers.IO) {
            try {
                if (!api.ensureFresh()) { withContext(Dispatchers.Main) { screen = Screen.Login }; return@withContext }
                api.registerDevice(store.deviceId)
                api.preferences()?.let { store.unit = it.optString("weight_unit", "kg"); store.timeZone = it.optString("time_zone", store.timeZone) }
                val arr = api.routines()
                val r = (0 until arr.length()).map { i -> arr.getJSONObject(i) }.map { o ->
                    val d = o.getJSONArray("schedule_days")
                    Routine(o.getString("id"), o.getString("name"), (0 until d.length()).map { d.getInt(it) }, o.getJSONArray("routine_exercises"))
                }
                val n = api.exerciseNames()
                val w = api.lastWeights()
                val left = store.flush(api)
                withContext(Dispatchers.Main) { routines = r; names = n; lastKg = w; pending = left; offline = false; unit = store.unit }
            } catch (e: IOException) {
                withContext(Dispatchers.Main) { offline = true }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { message = e.message }
            }
        }
    }

    val measuring = screen == Screen.Workout && live?.pausedAt == null
    DisposableEffect(measuring) {
        if (measuring) heart.start { bpm = it }
        onDispose { heart.stop() }
    }

    /** Queues completion + the measured average heart rate (if any), then clears local state. */
    fun finishSession(l: Live, action: String) {
        queue("transition_session", transitionParams(l.id, action))
        heart.average?.let { if (action == "complete") queue(PATCH_SESSION_HR, JSONObject().put("id", l.id).put("avg_hr", it)) }
        heart.reset()
        bpm = null
        save(null)
    }

    val zone = runCatching { ZoneId.of(store.timeZone) }.getOrDefault(ZoneId.systemDefault())
    fun fw(kg: Double?): String = if (kg == null) "—" else if (unit == "kg") fmt((kg * 2).roundToInt() / 2.0) else (kg * LB).roundToInt().toString()

    Box(Modifier.fillMaxSize().background(Bg), contentAlignment = Alignment.Center) {
        if (!api.configured) {
            Label("Falta configurar el servidor (secrets.properties)", N400, 13)
            return@Box
        }
        when (val s = screen) {
            Screen.Login -> LoginScreen(message) { email, pass ->
                scope.launch(Dispatchers.IO) {
                    try {
                        api.signIn(email.trim(), pass)
                        withContext(Dispatchers.Main) { message = null; screen = Screen.Home }
                    } catch (e: IOException) {
                        withContext(Dispatchers.Main) { message = "Sin conexión" }
                    } catch (e: Exception) {
                        withContext(Dispatchers.Main) { message = e.message ?: "Algo salió mal" }
                    }
                }
            }

            Screen.Home -> {
                val l = live
                val today = LocalDate.now(zone)
                val plan = routines.firstOrNull { it.days.contains(today.dayOfWeek.value) }
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 22.dp, vertical = 28.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    SyncLine(pending, offline)
                    Label(DateTimeFormatter.ofPattern("HH:mm").format(Instant.ofEpochMilli(now).atZone(zone)), TextC, 40, FontWeight.Medium)
                    Label(DateTimeFormatter.ofPattern("EEE d", Locale.forLanguageTag("es")).format(today).replaceFirstChar { it.uppercase() }, N400, 14)
                    Spacer(Modifier.height(6.dp))
                    if (l != null && !l.finished) {
                        Label("${l.name} en curso", Accent300, 14)
                        Pill("Continuar", primary = true) { screen = Screen.Workout }
                    } else {
                        Label("Plan de hoy", N400, 13)
                        Label(plan?.name ?: "Sin rutina hoy", TextC, 18, FontWeight.Medium)
                        val toStart = plan ?: routines.firstOrNull()
                        if (toStart != null) {
                            Pill(if (plan != null) "Empezar" else "Empezar ${toStart.name}", primary = true) {
                                if (!heart.hasPermission()) askHr.launch(heart.permission)
                                heart.reset()
                                val started = startSession(toStart, names, lastKg)
                                save(started)
                                queue("start_session", startParams(started, toStart, store.deviceId, store.timeZone))
                                screen = Screen.Workout
                            }
                        } else if (!offline) {
                            Label("Crea una rutina en la web o en el móvil", N500, 12)
                        }
                    }
                    Pill("Ánimo") { screen = Screen.Mood }
                    Pill("Cerrar sesión", small = true) { api.signOut(); save(null); screen = Screen.Login }
                }
            }

            Screen.Workout -> {
                val l = live ?: run { screen = Screen.Home; return@Box }
                val restLeft = l.restEndsAt?.let { ((it - now) / 1000).coerceAtLeast(0) } ?: 0
                when {
                    l.pausedAt != null -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Label("Sesión en pausa", TextC, 18, FontWeight.Medium)
                        Label(if (l.doneSets == 1) "1 serie hecha" else "${l.doneSets} series hechas", N400, 13)
                        Pill("Reanudar", primary = true) {
                            save(l.copy(pausedAt = null, pausedMs = l.pausedMs + (System.currentTimeMillis() - l.pausedAt)))
                            queue("transition_session", transitionParams(l.id, "resume"))
                        }
                        Pill("Terminar sesión", small = true) {
                            val action = if (l.doneSets > 0) "complete" else "abandon"
                            finishSession(l, action)
                            screen = if (action == "complete") Screen.Done(l.doneSets, l.volumeKg) else Screen.Home
                        }
                    }
                    restLeft > 0 -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        val total = (l.current.restS.coerceAtLeast(1)).toFloat()
                        Ring(restLeft / total)
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Label("Descanso", N400, 14)
                            Label(clock(restLeft), TextC, 56, FontWeight.Medium)
                            val nx = l.current.sets.getOrNull(l.nextSetIndex)
                            if (nx != null) Label("Sigue: ${fw(nx.w)} × ${nx.reps}", N400, 13)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 10.dp)) {
                                Pill("+15 s", small = true) { save(l.copy(restEndsAt = (l.restEndsAt ?: now) + 15_000)) }
                                Pill("Siguiente", primary = true, small = true) { save(l.copy(restEndsAt = null)) }
                            }
                        }
                    }
                    else -> {
                        val ex = l.current
                        val idx = l.nextSetIndex
                        if (idx < 0) {
                            // Exercise finished: move on, or finish the session.
                            val nextEx = l.exercises.indexOfFirst { e -> e.sets.any { !it.done } }
                            if (nextEx >= 0) { save(l.copy(cur = nextEx)); return@Box }
                            finishSession(l, "complete")
                            screen = Screen.Done(l.doneSets, l.volumeKg)
                            return@Box
                        }
                        val set = ex.sets[idx]
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Pill("Pausa", small = true) {
                                save(l.copy(pausedAt = System.currentTimeMillis(), restEndsAt = null))
                                queue("transition_session", transitionParams(l.id, "pause"))
                            }
                            Label(ex.name, Accent300, 14)
                            Label("Serie ${idx + 1} de ${ex.sets.size}", N400, 13)
                            Row(verticalAlignment = Alignment.Bottom, modifier = Modifier.clickable { screen = Screen.Edit }
                                .semantics { contentDescription = "Ajustar carga y repeticiones" }) {
                                Label(fw(set.w), TextC, 42, FontWeight.Medium)
                                Label(" $unit × ${set.reps}", N400, 14)
                            }
                            Pill("Serie hecha", primary = true, wide = true) {
                                val updated = l.copy(
                                    exercises = l.exercises.mapIndexed { i, e -> if (i != l.cur) e else e.copy(sets = e.sets.mapIndexed { j, x -> if (j == idx) x.copy(done = true) else x }) },
                                    restEndsAt = System.currentTimeMillis() + ex.restS * 1000L,
                                )
                                save(updated)
                                queue("record_set", JSONObject().put("p_id", set.id).put("p_session_exercise_id", ex.id).put("p_set_index", idx)
                                    .put("p_weight_kg", set.w ?: JSONObject.NULL).put("p_reps", set.reps)
                                    .put("p_completed_at", Instant.now().toString()).put("p_device_id", store.deviceId))
                            }
                            bpm?.let { Label("♥ $it lpm", N500, 12) }
                            SyncLine(pending, offline)
                        }
                    }
                }
            }

            Screen.Edit -> {
                val l = live ?: run { screen = Screen.Home; return@Box }
                val idx = l.nextSetIndex.coerceAtLeast(0)
                val set = l.current.sets[idx]
                val stepKg = if (unit == "kg") 2.5 else 5 / LB
                fun upd(w: Double?, reps: Int) = save(l.copy(exercises = l.exercises.mapIndexed { i, e ->
                    if (i != l.cur) e else e.copy(sets = e.sets.mapIndexed { j, x -> if (j >= idx && !x.done) x.copy(w = w, reps = reps) else x })
                }))
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Label(l.current.name, N400, 13)
                    Stepper(fw(set.w), unit, { upd(((set.w ?: 0.0) - stepKg).coerceAtLeast(0.0), set.reps) }, { upd((set.w ?: 0.0) + stepKg, set.reps) })
                    Stepper(set.reps.toString(), "reps", { upd(set.w, (set.reps - 1).coerceAtLeast(1)) }, { upd(set.w, set.reps + 1) })
                    Pill("Listo", small = true) { screen = Screen.Workout }
                }
            }

            Screen.Mood -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Label("¿Cómo te sientes?", TextC, 15, FontWeight.Medium)
                val labels = listOf("Muy mal", "Mal", "Normal", "Bien", "Muy bien")
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (1..5).forEach { m ->
                        Box(Modifier.size(34.dp).clip().border(1.dp, Divider, CircleShape).clickable {
                            val row = JSONObject().put("id", UUID.randomUUID().toString()).put("metric", "mood").put("value", m)
                                .put("start_at", Instant.now().toString()).put("time_zone", store.timeZone).put("source", "wear_os").put("device_id", store.deviceId)
                            queue("record_observations", JSONObject().put("p_rows", JSONArray().put(row)))
                            message = labels[m - 1]
                            screen = Screen.Home
                        }.semantics { contentDescription = labels[m - 1] }, contentAlignment = Alignment.Center) { Label(m.toString(), TextC, 15) }
                    }
                }
                Label("1 muy mal · 5 muy bien", N500, 11)
                Pill("Volver", small = true) { screen = Screen.Home }
            }

            is Screen.Done -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Label("✓", Ok, 30)
                Label("Sesión completada", TextC, 18, FontWeight.Medium)
                Label(series(s.sets) + " · " + (if (unit == "kg") "${s.volumeKg.roundToInt()} kg" else "${(s.volumeKg * LB).roundToInt()} lb"), N400, 13)
                SyncLine(pending, offline)
                Pill("Listo", small = true) { screen = Screen.Home }
            }
        }
    }
}

internal fun startSession(r: Routine, names: Map<String, String>, lastKg: Map<String, Double>): Live {
    val items = (0 until r.items.length()).map { r.items.getJSONObject(it) }.sortedBy { it.getInt("position") }
    return Live(
        id = UUID.randomUUID().toString(), name = r.name, startedAt = System.currentTimeMillis(), pausedAt = null, pausedMs = 0, cur = 0, restEndsAt = null,
        exercises = items.map { it ->
            val exId = it.getString("exercise_id")
            val w = lastKg[exId] ?: if (it.isNull("target_load_kg")) null else it.getDouble("target_load_kg")
            val reps = if (it.isNull("target_reps_min")) 8 else it.getInt("target_reps_min")
            LiveExercise(UUID.randomUUID().toString(), exId, names[exId] ?: "Ejercicio", if (it.isNull("target_rest_s")) 90 else it.getInt("target_rest_s"),
                (1..it.getInt("target_sets")).map { _ -> LiveSet(UUID.randomUUID().toString(), w, reps, false) })
        },
    )
}

/** start_session with the client-built snapshot, so sets recorded offline reference valid ids. */
internal fun startParams(l: Live, r: Routine, deviceId: String, tz: String): JSONObject {
    val items = (0 until r.items.length()).map { r.items.getJSONObject(it) }.sortedBy { it.getInt("position") }
    val ex = JSONArray()
    l.exercises.forEachIndexed { i, e ->
        val src = items[i]
        ex.put(JSONObject().put("id", e.id).put("exercise_id", e.exerciseId).put("position", i).put("planned_sets", src.getInt("target_sets"))
            .put("planned_reps_min", src.opt("target_reps_min") ?: JSONObject.NULL).put("planned_reps_max", src.opt("target_reps_max") ?: JSONObject.NULL)
            .put("planned_rest_s", src.opt("target_rest_s") ?: JSONObject.NULL).put("planned_load_kg", src.opt("target_load_kg") ?: JSONObject.NULL))
    }
    return JSONObject().put("p_id", l.id).put("p_routine_id", r.id).put("p_name", r.name).put("p_exercises", ex)
        .put("p_started_at", Instant.ofEpochMilli(l.startedAt).toString()).put("p_time_zone", tz).put("p_device_id", deviceId)
}

private fun transitionParams(id: String, action: String) =
    JSONObject().put("p_id", id).put("p_action", action).put("p_at", Instant.now().toString())

private fun series(n: Int) = if (n == 1) "1 serie" else "$n series"
private fun clock(s: Long) = "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
private fun fmt(v: Double) = if (v % 1.0 == 0.0) v.toInt().toString() else v.toString().replace('.', ',')

private fun Modifier.clip() = this.background(Color.Transparent, CircleShape)

// ── Building blocks (48–56 dp targets, 12 sp minimum: watch rules from the design system) ──
@Composable
private fun Label(text: String, color: Color, size: Int, weight: FontWeight = FontWeight.Normal) =
    BasicText(text, style = TextStyle(color = color, fontSize = size.sp, fontWeight = weight, textAlign = TextAlign.Center))

@Composable
private fun Pill(label: String, primary: Boolean = false, small: Boolean = false, wide: Boolean = false, onClick: () -> Unit) {
    val h = if (small) 44.dp else 52.dp
    Box(
        Modifier.height(h).then(if (wide) Modifier.width(168.dp) else Modifier)
            .background(if (primary) Accent.copy(alpha = 0.20f) else Color.Transparent, RoundedCornerShape(h / 2))
            .border(1.dp, if (primary) Accent else Divider, RoundedCornerShape(h / 2))
            .clickable(onClick = onClick).padding(horizontal = 18.dp),
        contentAlignment = Alignment.Center,
    ) { Label(label, if (primary) Accent100 else TextC, if (small) 13 else 16, FontWeight.Medium) }
}

@Composable
private fun Stepper(value: String, unit: String, dec: () -> Unit, inc: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(Modifier.size(48.dp).border(1.dp, Divider, CircleShape).clickable(onClick = dec).semantics { contentDescription = "Menos $unit" }, contentAlignment = Alignment.Center) { Label("−", TextC, 22) }
        Column(Modifier.width(76.dp), horizontalAlignment = Alignment.CenterHorizontally) { Label(value, TextC, 28, FontWeight.Medium); Label(unit, N400, 12) }
        Box(Modifier.size(48.dp).border(1.dp, Divider, CircleShape).clickable(onClick = inc).semantics { contentDescription = "Más $unit" }, contentAlignment = Alignment.Center) { Label("+", TextC, 22) }
    }
}

@Composable
private fun SyncLine(pending: Int, offline: Boolean) {
    when {
        pending > 0 -> Label(if (pending == 1) "1 envío pendiente" else "$pending envíos pendientes", Warn, 12)
        offline -> Label("Sin conexión", Warn, 12)
        else -> Label("Sincronizado", N500, 12)
    }
}

@Composable
private fun Ring(fraction: Float) {
    Canvas(Modifier.fillMaxSize().padding(6.dp)) {
        val stroke = 8.dp.toPx()
        val d = size.minDimension - stroke
        val tl = Offset((size.width - d) / 2, (size.height - d) / 2)
        drawArc(N800, 0f, 360f, false, tl, Size(d, d), style = Stroke(stroke))
        drawArc(Accent, -90f, 360f * fraction.coerceIn(0f, 1f), false, tl, Size(d, d), style = Stroke(stroke, cap = StrokeCap.Round))
    }
}

@Composable
private fun LoginScreen(error: String?, onSubmit: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 30.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Label("Kova Health", TextC, 18, FontWeight.Medium)
        if (error != null) Label(error, Warn, 12)
        Input(email, "Correo", KeyboardType.Email, false) { email = it }
        Input(pass, "Contraseña", KeyboardType.Password, true) { pass = it }
        Pill("Entrar", primary = true) { if (email.isNotBlank() && pass.isNotBlank()) onSubmit(email, pass) }
        Label("Usa la misma cuenta que en el móvil", N500, 11)
    }
}

@Composable
private fun Input(value: String, hint: String, type: KeyboardType, secret: Boolean, onChange: (String) -> Unit) {
    Box(Modifier.fillMaxWidth().height(44.dp).background(Surface, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp), contentAlignment = Alignment.CenterStart) {
        if (value.isEmpty()) Label(hint, N500, 13)
        BasicTextField(
            value = value, onValueChange = onChange, singleLine = true,
            textStyle = TextStyle(color = TextC, fontSize = 14.sp), cursorBrush = SolidColor(Accent),
            keyboardOptions = KeyboardOptions(keyboardType = type),
            visualTransformation = if (secret) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = hint },
        )
    }
}
