param location string = resourceGroup().location
param devAppName string = 'fitpoweranalyzer-dev'
param prodAppName string = 'fitpoweranalyzer-prd'

resource devStaticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: devAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
}

resource prodStaticWebApp 'Microsoft.Web/staticSites@2022-09-01' = {
  name: prodAppName
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
}

output devStaticWebAppEndpoint string = devStaticWebApp.properties.defaultHostname
output prodStaticWebAppEndpoint string = prodStaticWebApp.properties.defaultHostname 