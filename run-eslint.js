// This script runs eslint on the src and test directories synchronously, and logs the output to the console.
// We can use async way but for now this is better for tracking the output.
const { execSync } = require('child_process');

// TODO: 'test-bronze' is a directory is too big to check all at once, keep it separate for now
const directories = ['src', 'test', 'test-helpers'];

directories.forEach((dir) => {
  console.log(`Checking directory: ${dir}`);
  try {
    const result = execSync(`eslint ${dir} --format table --fix`, {
      stdio: 'inherit',
    });
    console.log(result.toString());
  } catch (err) {
    console.error(
      `Error checking directory ${dir}:`,
      err.stdout?.toString() || err.message || err
    );
  }
});
