package com.vida.watch

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Minimal Supabase client for the watch: GoTrue password auth + PostgREST reads/RPCs over HTTPS.
 * Same contract as @vida/api-client (docs/api.md). Only the public anon key is embedded; every
 * request carries the user's JWT and RLS enforces access on the server.
 */
class VidaApi(private val store: Store) {
    private val base = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val anon = BuildConfig.SUPABASE_ANON_KEY

    val configured: Boolean get() = base.startsWith("http") && anon.isNotBlank()

    /** Thrown for a response the server rejected (4xx). Network problems are IOException. */
    class ApiError(val status: Int, val code: String, message: String) : Exception(message)

    private fun request(method: String, path: String, body: String? = null, auth: Boolean = true, prefer: String? = null): String {
        val conn = (URL(base + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 10_000
            readTimeout = 15_000
            setRequestProperty("apikey", anon)
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Accept", "application/json")
            if (auth) store.accessToken?.let { setRequestProperty("Authorization", "Bearer $it") }
            prefer?.let { setRequestProperty("Prefer", it) }
            if (body != null) {
                doOutput = true
                outputStream.use { it.write(body.toByteArray()) }
            }
        }
        val status = conn.responseCode
        val text = (if (status in 200..299) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()
        if (status in 200..299) return text
        if (status >= 500) throw IOException("server $status")
        val code = runCatching { JSONObject(text).let { j -> j.str("error_code") ?: j.str("code") ?: "" } }.getOrDefault("")
        throw ApiError(status, code, Errors.message(code, status))
    }

    // ── Auth ────────────────────────────────────────────────────────────
    fun signIn(email: String, password: String) {
        val res = try {
            JSONObject(request("POST", "/auth/v1/token?grant_type=password", JSONObject().put("email", email).put("password", password).toString(), auth = false))
        } catch (e: ApiError) {
            throw ApiError(e.status, e.code, when {
                e.code == "email_not_confirmed" -> "Confirma tu correo primero"
                e.status == 400 || e.status == 401 -> "Correo o contraseña incorrectos"
                else -> e.message ?: "Algo salió mal"
            })
        }
        saveSession(res)
    }

    private fun saveSession(res: JSONObject) {
        store.saveSession(
            access = res.getString("access_token"),
            refresh = res.getString("refresh_token"),
            expiresAt = System.currentTimeMillis() / 1000 + res.optLong("expires_in", 3600),
            userId = res.getJSONObject("user").getString("id"),
        )
    }

    /** Refreshes the JWT a minute before expiry. Returns false if the session is gone. */
    fun ensureFresh(): Boolean {
        val refresh = store.refreshToken ?: return false
        if (store.expiresAt - 60 > System.currentTimeMillis() / 1000) return true
        return try {
            saveSession(JSONObject(request("POST", "/auth/v1/token?grant_type=refresh_token", JSONObject().put("refresh_token", refresh).toString(), auth = false)))
            true
        } catch (e: ApiError) {
            store.clearSession()
            false
        }
    }

    fun signOut() = store.clearSession()

    // ── Reads ───────────────────────────────────────────────────────────
    fun get(path: String): JSONArray { ensureFresh(); return JSONArray(request("GET", path)) }

    fun preferences(): JSONObject? = get("/rest/v1/user_preferences?select=weight_unit,time_zone").optJSONObject(0)

    fun routines(): JSONArray =
        get("/rest/v1/routines?select=id,name,schedule_days,routine_exercises(exercise_id,position,target_sets,target_reps_min,target_reps_max,target_rest_s,target_load_kg)&deleted_at=is.null&archived_at=is.null&order=created_at")

    fun exerciseNames(): Map<String, String> {
        val arr = get("/rest/v1/exercises?select=id,name,short_name&archived_at=is.null&limit=200")
        return (0 until arr.length()).associate { i -> arr.getJSONObject(i).let { it.getString("id") to (it.str("short_name") ?: it.getString("name")) } }
    }

    /** Top weight of the latest session per exercise (to prefill sets). */
    fun lastWeights(): Map<String, Double> {
        val arr = get("/rest/v1/exercise_history?select=exercise_id,session_id,weight_kg&order=completed_at.desc&limit=300")
        val session = HashMap<String, String>()
        val top = HashMap<String, Double>()
        for (i in 0 until arr.length()) {
            val h = arr.getJSONObject(i)
            if (h.isNull("weight_kg")) continue
            val ex = h.getString("exercise_id")
            val s = session[ex]
            if (s != null && s != h.getString("session_id")) continue
            session[ex] = h.getString("session_id")
            top[ex] = maxOf(top[ex] ?: 0.0, h.getDouble("weight_kg"))
        }
        return top
    }

    // ── Writes (all idempotent on client-generated ids) ─────────────────
    fun rpc(fn: String, params: JSONObject): String { ensureFresh(); return request("POST", "/rest/v1/rpc/$fn", params.toString()) }

    /** Sets the session's measured average heart rate (Health Services). Idempotent. */
    fun patchSessionHr(sessionId: String, avgHr: Int) {
        ensureFresh()
        request("PATCH", "/rest/v1/workout_sessions?id=eq.$sessionId", JSONObject().put("avg_hr", avgHr).toString(), prefer = "return=minimal")
    }

    fun registerDevice(id: String) {
        ensureFresh()
        val row = JSONObject().put("id", id).put("kind", "watch").put("platform", "wear_os").put("label", "Reloj")
            .put("last_seen_at", java.time.Instant.now().toString())
        request("POST", "/rest/v1/devices?on_conflict=id", JSONArray().put(row).toString(), prefer = "resolution=merge-duplicates,return=minimal")
    }
}

object Errors {
    fun message(code: String, status: Int): String = when (code) {
        "VD001" -> "Ya hay un entrenamiento en curso"
        "VD003" -> "La sesión ya terminó"
        "VD004" -> "Acción no válida ahora"
        "VD404" -> "No encontrado"
        else -> if (status == 401) "Inicia sesión de nuevo" else "Algo salió mal"
    }
}

/** String value, or null when the key is missing, JSON null or blank (optString would return "null"). */
fun JSONObject.str(key: String): String? = if (isNull(key)) null else optString(key).ifBlank { null }
