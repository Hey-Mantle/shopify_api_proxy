'use strict';

const mysql = require('mysql2/promise');
const gql = require('graphql-tag');

const SHOPIFY_API_VERSION = '2024-10';

const ALLOWED_QUERIES = [
  'shop',
  'app',
  'oneTimePurchase',
  'shopBillingPreferences',
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
  const query = parsedBody.query;
  const obj = gql`${query}`;
  return obj.definitions
    .filter(definition => definition.kind === 'OperationDefinition')
    .every(definition => {
      if (definition.operation === 'query') {
        return definition.selectionSet.selections.every(selection =>
          ALLOWED_QUERIES.some(allowedQuery => selection.name.value === allowedQuery)
        );
      } else if (definition.operation === 'mutation') {
        return definition.selectionSet.selections.every(selection =>
          ALLOWED_MUTATIONS.some(allowedMutation => selection.name.value === allowedMutation)
        );
      }
      return false;
    });
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

const getShopAccessToken = async (shopToken) => {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await connection.execute(
      'SELECT shopify_access_token, shopify_domain FROM shops WHERE proxy_shop_token = ?',
      [shopToken]
    );
    if (rows.length === 0) {
      throw new Error('Shop not found');
    }
    return rows[0];
  } finally {
    await connection.end();
  }
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
