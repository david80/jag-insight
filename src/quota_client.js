const https = require('https');
const logger = require('./logger');

class QuotaClient {
  async fetchQuota(port, token) {
    logger.info('QuotaClient', `Fetching quota from local server on port ${port}...`);

    try {
      const data = await this.request(port, token, '/exa.language_server_pb.LanguageServerService/GetUserStatus', {
        metadata: {
          ideName: 'antigravity',
          extensionName: 'antigravity',
          locale: 'ko', // Korean response settings
        }
      });

      const snapshot = this.parseResponse(data);
      logger.info('QuotaClient', 'Quota response successfully fetched and parsed', {
        email: snapshot.email,
        hasPromptCredits: !!snapshot.promptCredits,
        modelsCount: snapshot.models.length
      });

      return snapshot;
    } catch (error) {
      logger.error('QuotaClient', `Quota fetch failed: ${error.message}`);
      throw error;
    }
  }

  request(port, token, path, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': token
        },
        rejectUnauthorized: false, // Self-signed local cert
        timeout: 5000
      };

      const req = https.request(options, res => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Request failed with status ${res.statusCode}: ${responseBody}`));
              return;
            }
            resolve(JSON.parse(responseBody));
          } catch (e) {
            reject(new Error('Invalid JSON response from server'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  parseResponse(data) {
    const userStatus = data.userStatus || {};
    const planStatus = userStatus.planStatus || {};
    const planInfo = planStatus.planInfo;
    const availableCredits = planStatus.availablePromptCredits;

    // Parse prompt credits
    let promptCredits = null;
    if (planInfo && availableCredits !== undefined) {
      const monthly = Number(planInfo.monthlyPromptCredits);
      const available = Number(availableCredits);
      if (monthly > 0) {
        promptCredits = {
          available,
          monthly,
          usedPercentage: ((monthly - available) / monthly) * 100,
          remainingPercentage: (available / monthly) * 100
        };
      }
    }

    // Parse models quota
    const rawModels = (userStatus.cascadeModelConfigData && userStatus.cascadeModelConfigData.clientModelConfigs) || [];
    const models = rawModels
      .filter(m => m.quotaInfo)
      .map(m => {
        const resetTimeStr = m.quotaInfo.resetTime;
        const resetTime = resetTimeStr ? new Date(resetTimeStr) : null;
        const now = new Date();
        const diff = resetTime ? resetTime.getTime() - now.getTime() : 0;

        const rawFraction = m.quotaInfo.remainingFraction !== undefined
          ? Number(m.quotaInfo.remainingFraction)
          : undefined;

        const remainingFraction = rawFraction !== undefined ? rawFraction : 0;
        const isExhausted = (rawFraction !== undefined && rawFraction <= 0.001) || m.quotaInfo.status === 'EXHAUSTED';
        const isNA = rawFraction === undefined && m.quotaInfo.status !== 'EXHAUSTED';

        return {
          label: m.label,
          modelId: (m.modelOrAlias && m.modelOrAlias.model) || 'unknown',
          remainingFraction,
          remainingPercentage: remainingFraction * 100,
          isExhausted,
          isNA,
          resetTime: resetTime ? resetTime.toISOString() : null,
          timeUntilReset: diff,
          timeUntilResetFormatted: this.formatTime(diff, resetTime)
        };
      });

    // Extract email from multiple possible fields
    const email = userStatus.email ||
      (userStatus.user && userStatus.user.email) ||
      (userStatus.userProfile && userStatus.userProfile.email) ||
      (userStatus.user_profile && userStatus.user_profile.email) ||
      (data.user && data.user.email) ||
      (data.userProfile && data.userProfile.email) ||
      (data.user_status && data.user_status.user && data.user_status.user.email) ||
      'Unknown User';

    return {
      timestamp: new Date().toISOString(),
      email,
      promptCredits,
      models
    };
  }

  formatTime(ms, resetTime) {
    if (ms <= 0 || !resetTime) return 'Ready';

    const mins = Math.ceil(ms / 60000);
    let duration = '';

    if (mins < 60) {
      duration = `${mins}m`;
    } else if (mins < 24 * 60) {
      const hours = Math.floor(mins / 60);
      duration = `${hours}h ${mins % 60}m`;
    } else {
      const days = Math.floor(mins / (60 * 24));
      const hours = Math.floor((mins % (60 * 24)) / 60);
      duration = `${days}d ${hours}h`;
    }

    // Format date: e.g. "Mon 22:09" or similar
    const dateStr = resetTime.toLocaleDateString('ko-KR', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const formattedDate = dateStr.startsWith('(') ? dateStr : `(${dateStr})`;
    return `${duration} ${formattedDate}`;
  }
}

module.exports = new QuotaClient();
