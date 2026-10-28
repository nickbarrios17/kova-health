package com.vida.watch

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

/**
 * Local persistence on the watch: auth session, device id, the live workout and the outbox.
 * Everything survives process death, so a workout recorded offline is never lost (docs/sync.md).
 * Note: tokens are stored in app-private SharedPreferences (not readable by other apps).
 */
const val PATCH_SESSION_HR = "__patch_session_hr"

/** [prefsName] is "vida" in the app; instrumented tests pass their own so they never touch the user's data. */
class Store(context: Context, prefsName: String = "vida") {
    private val p = context.getSharedPreferences(prefsName, Context.MODE_PRIVATE)

    val accessToken: String? get() = p.getString("access", null)
    val refreshToken: String? get() = p.getString("refresh", null)
    val expiresAt: Long get() = p.getLong("expiresAt", 0)
    val signedIn: Boolean get() = refreshToken != null

    fun saveSession(access: String, refresh: String, expiresAt: Long, userId: String) {
        p.edit().putString("access", access).putString("refresh", refresh).putLong("expiresAt", expiresAt).putString("userId", userId).apply()
    }

    fun clearSession() {
        p.edit().remove("access").remove("refresh").remove("expiresAt").remove("userId").remove("live").remove("outbox").apply()
    }

    val deviceId: String
        get() = p.getString("deviceId", null) ?: UUID.randomUUID().toString().also { p.edit().putString("deviceId", it).apply() }

    var unit: String
        get() = p.getString("unit", "kg") ?: "kg"
        set(v) { p.edit().putString("unit", v).apply() }

    var timeZone: String
        get() = p.getString("tz", java.util.TimeZone.getDefault().id) ?: "UTC"
        set(v) { p.edit().putString("tz", v).apply() }

    var live: Live?
        get() = p.getString("live", null)?.let { runCatching { Live.fromJson(JSONObject(it)) }.getOrNull() }
        set(v) { p.edit().apply { if (v == null) remove("live") else putString("live", v.toJson().toString()) }.apply() }

    // ── Outbox: ordered RPC calls, each idempotent on its own client UUID ──
    private fun loadOutbox(): JSONArray = JSONArray(p.getString("outbox", "[]"))

    fun enqueue(fn: String, params: JSONObject) {
        val q = loadOutbox()
        q.put(JSONObject().put("fn", fn).put("params", params).put("status", "pending"))
        p.edit().putString("outbox", q.toString()).apply()
    }

    val pendingCount: Int
        get() = loadOutbox().let { q -> (0 until q.length()).count { q.getJSONObject(it).getString("status") == "pending" } }

    fun flush(api: VidaApi): Int = flush { fn, params ->
        if (fn == PATCH_SESSION_HR) api.patchSessionHr(params.getString("id"), params.getInt("avg_hr")) else api.rpc(fn, params)
    }

    /**
     * Sends pending ops in order through [send]. Stops on network errors (IOException: kept pending);
     * rejected ops (VidaApi.ApiError) are marked failed and skipped.
     */
    @Synchronized
    fun flush(send: (fn: String, params: JSONObject) -> Unit): Int {
        val q = loadOutbox()
        for (i in 0 until q.length()) {
            val op = q.getJSONObject(i)
            if (op.getString("status") != "pending") continue
            try {
                send(op.getString("fn"), op.getJSONObject("params"))
                op.put("status", "confirmed")
            } catch (e: IOException) {
                break
            } catch (e: VidaApi.ApiError) {
                op.put("status", "failed").put("error", e.message)
            }
            p.edit().putString("outbox", q.toString()).apply()
        }
        // Keep only what is still pending or failed.
        val keep = JSONArray()
        for (i in 0 until q.length()) if (q.getJSONObject(i).getString("status") != "confirmed") keep.put(q.getJSONObject(i))
        p.edit().putString("outbox", keep.toString()).apply()
        return pendingCount
    }
}

/** Live workout state (mirrors apps/mobile/src/workout.ts). Weights are kg. */
data class LiveSet(val id: String, val w: Double?, val reps: Int, val done: Boolean)

data class LiveExercise(val id: String, val exerciseId: String, val name: String, val restS: Int, val sets: List<LiveSet>)

data class Live(
    val id: String,
    val name: String,
    val startedAt: Long,
    val pausedAt: Long?,
    val pausedMs: Long,
    val cur: Int,
    val exercises: List<LiveExercise>,
    val restEndsAt: Long?,
    val finished: Boolean = false,
) {
    val current: LiveExercise get() = exercises[cur.coerceIn(0, exercises.lastIndex)]
    val nextSetIndex: Int get() = current.sets.indexOfFirst { !it.done }
    val doneSets: Int get() = exercises.sumOf { e -> e.sets.count { it.done } }
    val volumeKg: Double get() = exercises.sumOf { e -> e.sets.filter { it.done }.sumOf { (it.w ?: 0.0) * it.reps } }

    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("name", name).put("startedAt", startedAt).put("pausedAt", pausedAt ?: JSONObject.NULL)
        .put("pausedMs", pausedMs).put("cur", cur).put("restEndsAt", restEndsAt ?: JSONObject.NULL).put("finished", finished)
        .put("exercises", JSONArray().apply {
            exercises.forEach { e ->
                put(JSONObject().put("id", e.id).put("exerciseId", e.exerciseId).put("name", e.name).put("restS", e.restS)
                    .put("sets", JSONArray().apply { e.sets.forEach { s -> put(JSONObject().put("id", s.id).put("w", s.w ?: JSONObject.NULL).put("reps", s.reps).put("done", s.done)) } }))
            }
        })

    companion object {
        fun fromJson(o: JSONObject): Live {
            val ex = o.getJSONArray("exercises")
            return Live(
                id = o.getString("id"), name = o.getString("name"), startedAt = o.getLong("startedAt"),
                pausedAt = if (o.isNull("pausedAt")) null else o.getLong("pausedAt"), pausedMs = o.getLong("pausedMs"),
                cur = o.getInt("cur"), restEndsAt = if (o.isNull("restEndsAt")) null else o.getLong("restEndsAt"),
                finished = o.optBoolean("finished"),
                exercises = (0 until ex.length()).map { i ->
                    val e = ex.getJSONObject(i)
                    val sets = e.getJSONArray("sets")
                    LiveExercise(e.getString("id"), e.getString("exerciseId"), e.getString("name"), e.getInt("restS"),
                        (0 until sets.length()).map { j ->
                            val s = sets.getJSONObject(j)
                            LiveSet(s.getString("id"), if (s.isNull("w")) null else s.getDouble("w"), s.getInt("reps"), s.getBoolean("done"))
                        })
                },
            )
        }
    }
}
