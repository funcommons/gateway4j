package fun.commons.gateway4j.engine.metrics;

import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

class InFlightRequestTrackerTest {

    @Test
    void incrementAndDecrementRoundTrip() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        tracker.increment("/api/user/**");
        tracker.increment("/api/user/**");
        assertEquals(2L, tracker.activeFor("/api/user/**"));

        tracker.decrement("/api/user/**");
        assertEquals(1L, tracker.activeFor("/api/user/**"));

        tracker.decrement("/api/user/**");
        assertEquals(0L, tracker.activeFor("/api/user/**"));
        // extra decrement must not go negative (defensive floor)
        tracker.decrement("/api/user/**");
        assertEquals(0L, tracker.activeFor("/api/user/**"));
    }

    @Test
    void blankPatternFallsIntoOtherBucket() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        assertEquals(InFlightRequestTracker.OTHER_BUCKET, tracker.bucketFor(null));
        assertEquals(InFlightRequestTracker.OTHER_BUCKET, tracker.bucketFor("  "));
        assertEquals("_other", InFlightRequestTracker.OTHER_BUCKET);

        tracker.increment(tracker.bucketFor(null));
        assertEquals(1L, tracker.activeFor("_other"));
        assertEquals(1L, tracker.snapshot().get("_other"));
    }

    @Test
    void patternNormalizationMatchesMetricsPluginTagRules() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        // plain pattern passes through untouched (same as MetricsPlugin#normalizePath)
        assertEquals("/api/user/**", tracker.bucketFor("/api/user/**"));
        // numeric path segments → {id} (same rules as the meter path tag; note the
        // "1" in "/v1" is not preceded by a slash, so it stays)
        assertEquals("/v1/users/{id}", tracker.bucketFor("/v1/users/123"));
        // uuid segments → {id}
        assertEquals("/files/{id}/meta", tracker.bucketFor("/files/550e8400-e29b-41d4-a716-446655440000/meta"));
        // over-long patterns truncate at 100 chars, as the meter tag does
        String longPattern = "/" + "a".repeat(150);
        assertEquals(100, tracker.bucketFor(longPattern).length());
    }

    @Test
    void unknownBucketReadsZero() {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        assertEquals(0L, tracker.activeFor("/never-seen/**"));
        assertTrue(tracker.snapshot().isEmpty());
    }

    @Test
    void concurrentIncrementDecrementIsLossless() throws Exception {
        InFlightRequestTracker tracker = new InFlightRequestTracker();
        int threads = 8;
        int iterations = 2_000;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch latch = new CountDownLatch(threads);
        for (int t = 0; t < threads; t++) {
            pool.submit(() -> {
                try {
                    for (int i = 0; i < iterations; i++) {
                        tracker.increment("/api/x/**");
                        tracker.decrement("/api/x/**");
                    }
                } finally {
                    latch.countDown();
                }
            });
        }
        assertTrue(latch.await(30, TimeUnit.SECONDS));
        pool.shutdownNow();
        assertEquals(0L, tracker.activeFor("/api/x/**"), "balanced inc/dec must land back at 0");
    }
}
