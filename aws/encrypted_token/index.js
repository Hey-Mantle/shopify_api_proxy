'use strict';

const crypto = require('crypto');

const SHOPIFY_API_VERSION = '2024-10';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // This should be a shared secret between your app and the proxy
/*
  Encrypt the token with a aes-256-cbc cipher, for example:

  function encryptData(plaintext) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }
*/

const ALLOWED_QUERIES = [
  'shop',
  'app',
  'oneTimePurchase',
];

const ALLOWED_MUTATIONS = [
  'appSubscriptionCreate',
  'appSubscriptionCancel',
  'appSubscriptionTrialExtend',
  'appUsageRecordCreate',
  'appSubscriptionLineItemUpdate',
  'appPurchaseOneTimeCreate',
  'webhookSubscriptionCreate',
  'webhookSubscriptionDelete',
];

const isOperationAllowed = (body) => {
  const parsedBody = typeof body === 'object' ? body : JSON.parse(body);
  const operationName = parsedBody.operationName;
  const query = parsedBody.query;

  const match = query.match(/^\s*(query|mutation)?\s*(\w+)?\s*{/);
  if (!match) {
    return false;
  }

  let [, operationType, queryName] = match;
  operationType = operationType?.trim() || 'query';
  queryName = queryName?.trim() || operationName;

  if (operationType === 'query') {
    return ALLOWED_QUERIES.some(allowedQuery => 
      query.includes(`${allowedQuery}`));
  } else if (operationType === 'mutation') {
    const mutationName = queryName || query.match(/{?\s*(\w+)/)?.[1];
    return ALLOWED_MUTATIONS.includes(mutationName);
  }

  return false;
};

const buildResponse = (status, body, headers = {}) => {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  };
};


const getShopAccessToken = async (encryptedAccessToken) => {
  const [ivHex, encrypted] = encryptedAccessToken.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

module.exports.main = async (event) => {
  const proxyToken = event.headers['X-Shopify-Access-Token'];

  if (!proxyToken) {
    return buildResponse(400, { error: 'Missing X-Shopify-Access-Token header' });
  }

  try {
    const { shopify_access_token, shopify_domain } = await getShopAccessToken(proxyToken);

    if (!isOperationAllowed(event.body)) {
      return buildResponse(403, { error: 'Operation not allowed' });
    }

    const url = `https://${shopify_domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
    const shopifyResponse = await fetch(url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': shopify_access_token,
        },
        body: event.body,
      }
    );

    const responseData = await shopifyResponse.json();

    return buildResponse(
      shopifyResponse.status,
      responseData,
    );
  } catch (error) {
    console.error('Error:', error);
    if (error.message === 'Shop not found') {
      return buildResponse(401, { error: 'Invalid shop token' });
    }
    return buildResponse(500, { error: 'Internal server error' });
  }
};
