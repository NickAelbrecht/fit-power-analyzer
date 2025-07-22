param location string = resourceGroup().location
param appName string
param skuName string = 'Free'

resource staticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: appName
  location: location
  sku: {
    name: skuName
    tier: skuName
  }
}

output staticWebAppEndpoint string = staticWebApp.properties.defaultHostname 