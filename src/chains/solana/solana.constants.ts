export const constants = {
  retry: {
    all: {
      maxNumberOfRetries: 0, // 0 means no retries
      delayBetweenRetries: 0, // 0 means no delay (milliseconds)
    },
  },
  timeout: {
    all: 0, // 0 means no timeout (milliseconds)
  },
  parallel: {
    all: {
      batchSize: 0, // 0 means no batching (group all)
      delayBetweenBatches: 0, // 0 means no delay (milliseconds)
    },
  },
};

export default constants;
