package com.vida.watch

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.IOException

/**
 * Runs on the watch. Uses its own SharedPreferences file ("vida-test"), so the signed-in
 * session, live workout and outbox of the real app ("vida") are never read or changed.
 */
@RunWith(AndroidJUnit4::class)
class StoreTest {
    private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var store: Store

    @Before fun setUp() {
        ctx.deleteSharedPreferences(PREFS)
        store = Store(ctx, PREFS)
    }

    @After fun tearDown() {
        ctx.deleteSharedPreferences(PREFS)
    }

    private fun op(n: Int) = JSONObject().put("n", n)

    @Test fun outboxSendsInOrderAndRemovesConfirmed() {
        (1..3).forEach { store.enqueue("record_set", op(it)) }
        val sent = mutableListOf<Int>()
        val left = store.flush { _, p -> sent += p.getInt("n") }
        assertEquals(listOf(1, 2, 3), sent)
        assertEquals(0, left)
        assertEquals(0, store.pendingCount)
    }

    @Test fun networkErrorKeepsTheRestPendingInOrder() {
        (1..3).forEach { store.enqueue("record_set", op(it)) }
        val sent = mutableListOf<Int>()
        val left = store.flush { _, p -> if (p.getInt("n") == 2) throw IOException("offline"); sent += p.getInt("n") }
        assertEquals(listOf(1), sent)
        assertEquals(2, left)
        // Back online: the remaining ops go out in their original order.
        store.flush { _, p -> sent += p.getInt("n") }
        assertEquals(listOf(1, 2, 3), sent)
        assertEquals(0, store.pendingCount)
    }

    @Test fun rejectedOpIsMarkedFailedAndDoesNotBlockTheQueue() {
        (1..2).forEach { store.enqueue("record_set", op(it)) }
        val sent = mutableListOf<Int>()
        val left = store.flush { _, p ->
            if (p.getInt("n") == 1) throw VidaApi.ApiError(400, "VD003", "La sesión ya terminó")
            sent += p.getInt("n")
        }
        assertEquals(listOf(2), sent)
        assertEquals(0, left)
        // A failed op is not retried on the next flush.
        store.flush { _, p -> sent += p.getInt("n") }
        assertEquals(listOf(2), sent)
    }

    @Test fun outboxAndLiveSurviveANewStoreInstance() {
        store.enqueue("transition_session", op(7))
        store.live = sampleLive()
        val again = Store(ctx, PREFS) // as after the process is killed
        assertEquals(1, again.pendingCount)
        assertEquals(sampleLive(), again.live)
    }

    @Test fun liveJsonRoundTripKeepsNullsAndFlags() {
        val l = sampleLive().copy(pausedAt = 1_700_000_100_000, pausedMs = 4_000, restEndsAt = 1_700_000_200_000, finished = true)
        assertEquals(l, Live.fromJson(JSONObject(l.toJson().toString())))
    }

    @Test fun liveDerivedValues() {
        val l = sampleLive()
        assertEquals(1, l.doneSets)
        assertEquals(500.0, l.volumeKg, 0.0)
        assertEquals(1, l.nextSetIndex)
    }

    @Test fun clearSessionDropsTokensLiveAndOutbox() {
        store.saveSession("a", "r", 1L, "u")
        store.live = sampleLive()
        store.enqueue("record_set", op(1))
        assertTrue(store.signedIn)
        store.clearSession()
        assertFalse(store.signedIn)
        assertNull(store.live)
        assertEquals(0, store.pendingCount)
    }

    @Test fun deviceIdIsStable() {
        assertEquals(store.deviceId, Store(ctx, PREFS).deviceId)
    }

    @Test fun startSessionBuildsSnapshotInRoutineOrder() {
        val items = JSONArray()
            .put(JSONObject().put("position", 1).put("exercise_id", "curl").put("target_sets", 3).put("target_reps_min", 10)
                .put("target_reps_max", 10).put("target_rest_s", 60).put("target_load_kg", 12.5))
            .put(JSONObject().put("position", 0).put("exercise_id", "squat").put("target_sets", 2).put("target_reps_min", JSONObject.NULL)
                .put("target_reps_max", JSONObject.NULL).put("target_rest_s", JSONObject.NULL).put("target_load_kg", JSONObject.NULL))
        val r = Routine("r1", "Fuerza A", listOf(1, 4), items)
        val l = startSession(r, mapOf("squat" to "Sentadilla"), mapOf("squat" to 80.0))

        assertEquals(listOf("squat", "curl"), l.exercises.map { it.exerciseId })
        val squat = l.exercises[0]
        assertEquals("Sentadilla", squat.name)
        assertEquals(90, squat.restS) // default rest
        assertEquals(List(2) { 80.0 }, squat.sets.map { it.w }) // last weight wins
        assertEquals(List(2) { 8 }, squat.sets.map { it.reps }) // default reps
        val curl = l.exercises[1]
        assertEquals("Ejercicio", curl.name) // unknown name
        assertEquals(List(3) { 12.5 }, curl.sets.map { it.w }) // planned load
        assertEquals(5, l.exercises.flatMap { it.sets }.map { it.id }.toSet().size) // unique set ids

        val p = startParams(l, r, "dev-1", "America/Argentina/Buenos_Aires")
        val ex = p.getJSONArray("p_exercises")
        assertEquals(l.id, p.getString("p_id"))
        assertEquals(squat.id, ex.getJSONObject(0).getString("id")) // offline sets reference these ids
        assertEquals(0, ex.getJSONObject(0).getInt("position"))
        assertEquals(3, ex.getJSONObject(1).getInt("planned_sets"))
        assertEquals("America/Argentina/Buenos_Aires", p.getString("p_time_zone"))
    }

    @Test fun strTreatsJsonNullAsMissing() {
        // User exercises have short_name = null; optString would return the text "null".
        val o = JSONObject("""{"name":"Hip thrust","short_name":null,"blank":"  "}""")
        assertNull(o.str("short_name"))
        assertNull(o.str("missing"))
        assertNull(o.str("blank"))
        assertEquals("Hip thrust", o.str("short_name") ?: o.str("name"))
    }

    private fun sampleLive() = Live(
        id = "s1", name = "Fuerza B", startedAt = 1_700_000_000_000, pausedAt = null, pausedMs = 0, cur = 0, restEndsAt = null,
        exercises = listOf(
            LiveExercise("e1", "deadlift", "Peso muerto", 120, listOf(LiveSet("a", 100.0, 5, true), LiveSet("b", null, 5, false))),
        ),
    )

    private companion object { const val PREFS = "vida-test" }
}
