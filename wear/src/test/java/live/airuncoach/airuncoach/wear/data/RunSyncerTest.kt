package live.airuncoach.airuncoach.wear.data

import kotlinx.coroutines.test.runTest
import live.airuncoach.airuncoach.wear.storage.FakeRunFileSystem
import live.airuncoach.airuncoach.wear.storage.PendingRunStore
import live.airuncoach.airuncoach.wear.storage.RunRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeApi : CompanionApi {
    var endOk = true
    var uploadOk = true
    var unauthorized = false
    val ended = mutableListOf<String>()
    val uploaded = mutableListOf<UploadBatchRequest>()

    override suspend fun startSession(body: SessionStartRequest) = ApiResult<Unit>(ok = true, value = Unit)
    override suspend fun sendData(body: SessionDataRequest) = ApiResult<String?>(ok = true)
    override suspend fun endSession(body: SessionEndRequest): ApiResult<String?> {
        if (unauthorized) return ApiResult(ok = false, unauthorized = true)
        ended += body.sessionId
        return ApiResult(ok = endOk, value = if (endOk) "run-${body.sessionId}" else null)
    }
    override suspend fun uploadBatch(sessionId: String, body: UploadBatchRequest): ApiResult<String?> {
        if (unauthorized) return ApiResult(ok = false, unauthorized = true)
        uploaded += body
        return ApiResult(ok = uploadOk, value = if (uploadOk) "run-$sessionId" else null)
    }
}

class RunSyncerTest {
    private val now = 100_000_000L
    private val store = PendingRunStore(FakeRunFileSystem())
    private val api = FakeApi()
    private val notified = mutableListOf<String>()
    private var phoneUp = true
    private var token = true

    private val syncer = RunSyncer(
        store = store, api = api,
        hasToken = { token },
        isPhoneConnected = { phoneUp },
        deviceModel = "Samsung Galaxy Watch (Wear OS)",
        appVersion = "1.0.6",
        notifyPhone = { sid, _ -> if (phoneUp) { notified += sid; true } else false },
        now = { now }
    )

    private fun run(id: String, finishedAgoMs: Long = 0, points: Int = 3) = RunRecord(
        sessionId = id, finishedAtMs = now - finishedAgoMs, startedAtEpochSec = 1_760_000_000,
        distanceM = 5000.0, durationSec = 1500,
        points = List(points) { listOf(it, 1, 2, 3, 4, 5, 6) }
    )

    @Test
    fun `fresh run - session end then track, then removed and phone told`() = runTest {
        store.enqueue(run("a"))
        val r = syncer.syncAll()
        assertEquals(1, r.synced)
        assertEquals(listOf("a"), api.ended)
        assertEquals(1, api.uploaded.size)
        assertFalse(store.hasPending())
        assertEquals(listOf("a"), notified)
    }

    @Test
    fun `upload carries the real start time and app details`() = runTest {
        store.enqueue(run("a"))
        syncer.syncAll()
        val body = api.uploaded.single()
        assertEquals(1_760_000_000L, body.startedAtEpoch)
        assertEquals("1.0.6", body.watchAppVersion)
        assertEquals("Samsung Galaxy Watch (Wear OS)", body.deviceModel)
        assertEquals(true, body.phoneConnected)
    }

    @Test
    fun `no connection - the run stays queued (it used to be deleted)`() = runTest {
        api.endOk = false
        api.uploadOk = false
        store.enqueue(run("a"))
        val r = syncer.syncAll()
        assertEquals(0, r.synced)
        assertEquals(1, r.remaining)
        assertTrue(store.hasPending())
        assertTrue(notified.isEmpty())
    }

    @Test
    fun `late sync skips session end so the run is dated by its start time`() = runTest {
        store.enqueue(run("old", finishedAgoMs = RunSyncer.END_SESSION_WINDOW_MS + 1))
        syncer.syncAll()
        assertTrue(api.ended.isEmpty())
        assertEquals(1, api.uploaded.size)
        assertFalse(store.hasPending())
    }

    @Test
    fun `session end succeeded but track failed - retry sends only the track`() = runTest {
        api.uploadOk = false
        store.enqueue(run("a"))
        syncer.syncAll()
        assertTrue(store.pending().single().endSent)

        api.uploadOk = true
        syncer.syncAll()
        assertEquals(listOf("a"), api.ended) // not sent twice
        assertFalse(store.hasPending())
    }

    @Test
    fun `summary-only run is saved by session end however late`() = runTest {
        store.enqueue(run("meta", finishedAgoMs = 24 * 3600_000L, points = 0))
        syncer.syncAll()
        assertEquals(listOf("meta"), api.ended)
        assertTrue(api.uploaded.isEmpty())
        assertFalse(store.hasPending())
    }

    @Test
    fun `one failing run doesn't block the others`() = runTest {
        store.enqueue(run("meta", finishedAgoMs = 24 * 3600_000L, points = 0))
        store.enqueue(run("track"))
        api.endOk = false
        val r = syncer.syncAll()
        assertEquals(1, r.synced)
        assertEquals(listOf("meta"), store.pending().map { it.sessionId })
    }

    @Test
    fun `rejected token stops the pass and keeps everything`() = runTest {
        api.unauthorized = true
        store.enqueue(run("a"))
        store.enqueue(run("b"))
        val r = syncer.syncAll()
        assertTrue(r.authBlocked)
        assertEquals(2, r.remaining)
    }

    @Test
    fun `no token yet - nothing is attempted`() = runTest {
        token = false
        store.enqueue(run("a"))
        val r = syncer.syncAll()
        assertTrue(r.authBlocked)
        assertTrue(api.ended.isEmpty() && api.uploaded.isEmpty())
    }

    @Test
    fun `synced while the phone is away - remembered for the next connect`() = runTest {
        phoneUp = false
        store.enqueue(run("a"))
        syncer.syncAll()
        assertFalse(store.hasPending())
        assertEquals(listOf("a"), store.takeUnnotified().map { it.sessionId })
    }
}
