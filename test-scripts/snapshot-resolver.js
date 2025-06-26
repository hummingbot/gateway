const path = require('path');

module.exports = {
  // resolves from test to snapshot path
  resolveSnapshotPath: (testPath, snapshotExtension) => {
    // This resolver makes a snapshot path from a recorder test path to a
    // corresponding unit test snapshot path.
    // e.g., test-scripts/rnpExample/rnpExample.recorder.test.ts
    //       -> test/rnpExample/__snapshots__/rnpExample.test.ts.snap
    return path.join(
      path.dirname(testPath).replace('test-scripts', 'test'),
      '__snapshots__',
      path.basename(testPath).replace('.recorder', '') + snapshotExtension,
    );
  },

  // resolves from snapshot to test path
  resolveTestPath: (snapshotFilePath, snapshotExtension) => {
    // This resolver finds the recorder test path from a unit test snapshot path.
    // e.g., test/rnpExample/__snapshots__/rnpExample.test.ts.snap
    //       -> test-scripts/rnpExample/rnpExample.recorder.test.ts
    const testPath = path
      .dirname(snapshotFilePath)
      .replace('__snapshots__', '')
      .replace('test', 'test-scripts');

    return path.join(
      testPath,
      path
        .basename(snapshotFilePath, snapshotExtension)
        .replace('.test.ts', '.recorder.test.ts'),
    );
  },

  // Example test path, used for preflight consistency check of the implementation above
  testPathForConsistencyCheck:
    'test-scripts/rnpExample/rnpExample.recorder.test.ts',
};
