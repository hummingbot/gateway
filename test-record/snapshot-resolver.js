const path = require('path');

module.exports = {
  // resolves from test to snapshot path
  resolveSnapshotPath: (testPath, snapshotExtension) => {
    // This resolver makes a snapshot path from a "Record" test path to a
    // corresponding "Play" test snapshot path.
    // e.g., test-record/rnpExample/rnpExample.record.test.ts
    //       -> test/rnpExample/__snapshots__/rnpExample.test.ts.snap
    return path.join(
      path.dirname(testPath).replace('test-record', 'test-play'),
      '__snapshots__',
      path.basename(testPath).replace('.record', '.play') + snapshotExtension,
    );
  },

  // resolves from snapshot to test path  
  resolveTestPath: (snapshotFilePath, snapshotExtension) => {
    // This resolver finds the "Record" test path from a "Play" test snapshot path.
    // e.g., test/rnpExample/__snapshots__/rnpExample.test.ts.snap
    //       -> test-record/rnpExample/rnpExample.record.test.ts
    const testPath = path
      .dirname(snapshotFilePath)
      .replace('__snapshots__', '')
      .replace('test-play', 'test-record');

    return path.join(
      testPath,
      path
        .basename(snapshotFilePath, snapshotExtension)
        .replace('.play.test.ts', '.record.test.ts'),
    );
  },

  // Example test path, used for preflight consistency check of the implementation above
  testPathForConsistencyCheck:
    'test-record/rnpExample/rnpExample.record.test.ts',
};
