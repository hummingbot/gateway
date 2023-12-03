import { ConfigManagerV2 } from '../../services/config-manager-v2';

const configManager = ConfigManagerV2.getInstance();

export const constants = {
  retry: {
    all: {
      maxNumberOfRetries:
        configManager.get('xrpl.retry.all.maxNumberOfRetries') || 0, // 0 means no retries
      delayBetweenRetries:
        configManager.get('xrpl.retry.all.delayBetweenRetries') || 0, // 0 means no delay (milliseconds)
    },
  },
  timeout: {
    all: configManager.get('xrpl.timeout.all') || 0, // 0 means no timeout (milliseconds)
  },
  parallel: {
    all: {
      batchSize: configManager.get('xrpl.parallel.all.batchSize') || 0, // 0 means no batching (group all)
      delayBetweenBatches:
        configManager.get('xrpl.parallel.all.delayBetweenBatches') || 0, // 0 means no delay (milliseconds)
    },
  },
};

export default constants;
