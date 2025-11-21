import fs from 'fs';

import { ConfigManagerCertPassphrase } from './services/config-manager-cert-passphrase';
import { ConfigManagerV2 } from './services/config-manager-v2';

export const getHttpsOptions = () => {
  const certPath = addSlashToPath(ConfigManagerV2.getInstance().get('server.certificatePath'));
  const useCerts = ConfigManagerV2.getInstance().get('server.useCerts') || false;

  return {
    key: fs.readFileSync(certPath + 'server_key.pem'),
    cert: fs.readFileSync(certPath + 'server_cert.pem'),
    ca: [fs.readFileSync(certPath + 'ca_cert.pem')],
    passphrase: ConfigManagerCertPassphrase.readPassphrase(),
    // Require client certificates only if useCerts is true
    requestCert: useCerts,
    rejectUnauthorized: useCerts,
  };
};

const addSlashToPath = (path: string) => {
  if (!path.endsWith('/')) {
    path += '/';
  }
  return path;
};
