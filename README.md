# Shopify API Proxy

This repo serves as a set of example proxy endpoint implementations for the Shopify Admin GraphQL API that you can use to restrict access to only allow certain queries and mutations when using the Mantle App API.

Contact support@heymantle.com if you want to use this with your apps on Mantle.

## Proxy access token

To use this, all `POST /identify` requests to the Mantle App API should include an `accessToken` parameter with a generated/encrypted proxy access token from your app. This token should be something you can look up from this proxy to get the shop's real Shopify access token to use on the request to Shopify. This token should be a cryptographically-secure random string generated for each shop or a strongly encrypted version of the real token.

## Example implementations

### AWS Lambda (Node.js)

There are two example implementations in the `aws` directory:

1. `encrypted_token` - uses a shared secret to decrypt the token to get the real Shopify access token
2. `database_lookup` - uses a unique identifier that was generated with your app to look up the real Shopify access token from a database. This requires a connection to your database.

#### Deploying the proxy to AWS

Either use the Serverless Framework CLI to deploy the proxy:

```
cd aws/encrypted_token
serverless deploy
```

Or, manually create the lambda function and API Gateway endpoint in the AWS console and use the index.js file in the respective directory as the implementation.

