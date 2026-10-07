# 🔧 ecoNET-300 API Construction Guide

## 📋 Overview

This document explains how to construct API calls for ecoNET300 controllers using the `rm...` endpoint structure and how the `dev_set...` JavaScript files generate these API responses.

## 🎯 Project Structure

### Test Fixtures (`tests/fixtures/ecoMAX810P-L/`)
The `rm...json` files represent **real API endpoint responses** captured from actual ecoNET controllers:

- `rmStructure.json` - Menu structure and navigation
- `rmLocksNames.json` - Lock/restriction messages  
- `rmParamsNames.json` - Parameter names (translated)
- `rmParamsData.json` - Parameter metadata (min/max, units, etc.)
- `rmParamsDescs.json` - Parameter descriptions
- `rmParamsEnums.json` - Enumeration values
- `rmCurrentDataParams.json` - Current parameter values
- `rmCurrentDataParamsEdits.json` - Editable parameters
- `rmLangs.json` - Available languages
- `rmAlarmsNames.json` - Alarm descriptions

### Cloud Translation Files (`docs/cloud_translations/js_files/`)
The `dev_set...` JavaScript files contain the **official ecoNET24 web interface code**:

- `dev_set1.js` - Core controller functions and API calls
- `dev_set2.js` - Tiles, animations, and UI components
- `dev_set3.js` - Alarms, schedules, and advanced features
- `dev_set4.js` - Update processes and device management
- `dev_set5.js` - UI management and device interaction

## 🔧 API Endpoint Construction

### Base URL Pattern
```bash
https://your-controller-ip/service/rmEndpoint?parameters
```

### Core API Endpoints

| Endpoint | Purpose | Parameters |
|----------|---------|------------|
| `rmLangs` | Available languages | `uid` (optional) |
| `rmParamsNames` | Parameter names (translated) | `uid`, `lang` |
| `rmParamsData` | Parameter metadata | `uid` |
| `rmParamsDescs` | Parameter descriptions | `uid`, `lang` |
| `rmParamsEnums` | Enumeration values | `uid`, `lang` |
| `rmParamsUnitsNames` | Unit names | `uid`, `lang` |
| `rmCatsNames` | Category names | `uid`, `lang` |
| `rmCatsDescs` | Category descriptions | `uid`, `lang` |
| `rmStructure` | Menu structure | `uid`, `lang` |
| `rmCurrentDataParams` | Current parameter values | `uid`, `lang` |
| `rmCurrentDataParamsEdits` | Editable parameters | `uid` |
| `rmLocksNames` | Lock/restriction messages | `uid`, `lang` |
| `rmAlarmsNames` | Alarm descriptions | `uid`, `lang` |
| `rmExistingLangs` | Available language list | `uid` |

### API Construction Rules

1. **Base URL**: Always use `/service/` prefix
2. **Device Selection**: Add `uid` parameter for specific device
3. **Language Support**: Add `lang` parameter for translations
4. **Method**: Always GET requests
5. **Response**: JSON format
6. **Caching**: Disable caching (`cache: false`)

## 📝 Practical Examples

### 1. Get Parameter Names
```bash
# For specific device with English language
GET /service/rmParamsNames?uid=DEVICE_UID&lang=en

# For default device
GET /service/rmParamsNames?lang=en
```

### 2. Get Current Data
```bash
# Current parameter values
GET /service/rmCurrentDataParams?uid=DEVICE_UID&lang=en

# Editable parameters
GET /service/rmCurrentDataParamsEdits?uid=DEVICE_UID
```

### 3. Get Structure Information
```bash
# Menu structure
GET /service/rmStructure?uid=DEVICE_UID&lang=en

# Parameter descriptions
GET /service/rmParamsDescs?uid=DEVICE_UID&lang=en
```

### 4. Get Language Information
```bash
# Available languages
GET /service/rmLangs?uid=DEVICE_UID

# Existing language list
GET /service/rmExistingLangs?uid=DEVICE_UID
```

## 🔄 How `dev_set...` Files Generate API Responses

### JavaScript API Call Pattern

From `dev_set1.js`, here's the standard pattern for API calls:

```javascript
this.getRemoteMenuParamsNames = function(responseMethod, lang) {
    $.ajax({
        type: "GET",
        dataType: 'json',
        cache: false,
        url: this.destination_ + 
            (updater.currentDevice_ ? 
                "rmParamsNames?uid=" + encodeURIComponent(updater.currentDevice_) + 
                "&lang=" + encodeURIComponent(lang) : 
                "rmParamsNames"),
        success: responseMethod,
        error: logError
    });
}
```

### Data Flow Process

1. **JavaScript Functions** in `dev_set1.js` make AJAX calls to `rm...` endpoints
2. **Controller Response** returns JSON data matching the `rm...` file structure
3. **UI Rendering** uses the response data to populate the web interface
4. **Test Fixtures** capture these responses for integration testing

### Example Response Structure

```json
{
    "remoteMenuParamsNamesVer": "20590_1",
    "data": {
        "tempCO": "Boiler temperature",
        "tempCWU": "DHW temperature",
        "fanPower": "Fan power",
        "fuelLevel": "Fuel level"
    }
}
```

## 🎯 Implementation Strategy

### 1. Start with Core Endpoints
- `rmCurrentDataParams` - Get current values
- `rmParamsNames` - Get parameter names
- `rmParamsData` - Get parameter metadata

### 2. Add Language Support
- Use `rmLangs` to discover available languages
- Always include `lang` parameter for proper translations
- Fall back to default language if specific language not available

### 3. Implement Caching
- Cache responses per device to reduce API calls
- Use version fields to detect changes
- Implement proper cache invalidation

### 4. Handle Errors
- Check for `error` fields in responses
- Handle network timeouts gracefully
- Implement retry logic for failed requests

### 5. Test with Fixtures
- Use `rm...` JSON files for testing
- Validate response structure matches expected format
- Test error scenarios

## 🔍 Key Insights

### Parameter Mapping
- Use `rmParamsNames` to get human-readable parameter names
- Use `rmParamsData` to get parameter metadata (min/max values, units)
- Use `rmCurrentDataParams` to get current values

### Device Management
- Include `uid` parameter for multi-device setups
- Handle device selection logic in your integration
- Cache responses per device to avoid unnecessary calls

### Language Handling
- Always include `lang` parameter for proper translations
- Use `rmLangs` to discover available languages
- Implement fallback to default language

### Error Handling
- Check for `error` fields in responses
- Handle network timeouts gracefully
- Implement retry logic for failed requests

## 📚 File References

### Test Fixtures
- `tests/fixtures/ecoMAX810P-L/rmStructure.json`
- `tests/fixtures/ecoMAX810P-L/rmParamsNames.json`
- `tests/fixtures/ecoMAX810P-L/rmCurrentDataParams.json`

### Cloud Translation Files
- `docs/cloud_translations/js_files/dev_set1.js`
- `docs/cloud_translations/js_files/dev_set2.js`
- `docs/cloud_translations/js_files/dev_set3.js`
- `docs/cloud_translations/js_files/dev_set4.js`
- `docs/cloud_translations/js_files/dev_set5.js`

### Download Information
- `docs/cloud_translations/js_files/download_info.txt`

## 🚀 Next Steps

1. **Implement Core API Calls**: Start with basic parameter retrieval
2. **Add Language Support**: Implement multi-language functionality
3. **Test with Fixtures**: Use existing JSON files for validation
4. **Handle Edge Cases**: Implement proper error handling
5. **Optimize Performance**: Add caching and request optimization

This guide provides a complete understanding of how to construct API calls that will work with real ecoNET controllers, using the official ecoNET24 interface as your reference implementation.

## 📚 Related Documentation

- **[Dynamic Entity Validation](DYNAMIC_ENTITY_VALIDATION.md)** - Validation layer for dynamic entities created from `mergedData` endpoint, including parameter locking and entity type detection