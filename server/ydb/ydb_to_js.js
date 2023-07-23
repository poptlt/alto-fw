function resultSetToJs(resultSet) {

    const rows = resultSet.rows || []
    const columns = resultSet.columns || []
    return rows.map(row => rowToJs(row, columns))    
}

function rowToJs(row, columns) {

    const items = row.items || []
    const result = {}
    items.forEach((ydbValue, index) => {
        const column = columns[index];
        result[column.name] = valueToJs(ydbValue, column);
    });
      return result
}

function longToBigInt({unsigned, low, high}) {
    
    if (unsigned) {

      const result = BigInt(low >>> 0) + (BigInt(high >>> 0) << 32n)
      return result
    }
  
    if (high >>> 31) {

      low = ~low + 1 >>> 0
      high = ~high >>> 0
      if (!low) {
        high = high + 1 >>> 0
      }
      return -(BigInt(low) + (BigInt(high) << 32n))
    }
  
    return BigInt(low >>> 0) + (BigInt(high >>> 0) << 32n)
}

function transformValueByPropName(propName, value) {

    switch (propName) {
      case 'bytesValue': return Buffer.from(value, 'base64').toString()
      case 'int64Value': return longToBigInt(value)
      case 'uint64Value': return longToBigInt(value)
      case 'nullFlagValue': return null
      default: return value
    }
}

function extractValue(ydbValue) {

    const nonPrimitiveProps = ['items', 'pairs', 'nestedValue']
    const propName = Object.keys(ydbValue).find(key => !nonPrimitiveProps.includes(key))
    
    if (!propName) {
        throw {code: 'SYSTEM', message: `Ждем примитивное значение, а получаем ${ydbValue}!`}
    }

    const value = ydbValue[propName]

    return transformValueByPropName(propName, value)
}

function getColumnTypeId(column) {

    let { type } = column
    type = JSON.parse(JSON.stringify(type))

    const typeId = (type?.optionalType?.item?.typeId || type?.typeId) ?? null

    if (typeId === null) {
      throw {code: 'SYSTEM', message: `Не удалось найти тип столбца для ${JSON.stringify(column)}.`}
    }

    return typeId
}

function convertToDateObjectIfNeeded(typeId, value) {

    switch (typeId) {
      case 'DATE': return new Date((value) * 3600 * 1000 * 24);
      case 'DATETIME': return new Date((value) * 1000);
      case 'TIMESTAMP': return new Date(Number((value) / 1000n));
      case 'TZ_DATE': return new Date(value);
      case 'TZ_DATETIME': return new Date(value);
      case 'TZ_TIMESTAMP': return new Date(value);
      default: return value;
    }
}

function valueToJs(ydbValue, column) {

    const value = extractValue(ydbValue)

    if (value === null) return null

    const typeId = getColumnTypeId(column)

    if (typeId == 'JSON' || typeId == 'JSON_DOCUMENT') return JSON.parse(value)
    
    return convertToDateObjectIfNeeded(typeId, value)
}

module.exports = function(data, one_row = false, one_col = false) {

    res = resultSetToJs(data)
                
    if (!!one_row) {

        if (res.length == 0) {

          if (!!one_col) return undefined
          else return {}
        }

        else if (res.length == 1) {
          if (!!one_col) {
            if (Object.keys(res[0]).length != 1) throw new Error('ожидается один столбец в результате запроса')
            return res[0][Object.keys(res[0])[0]]
          }
          else return res[0]
        }

        else throw new Error('Ожидается не более одной строки')
    }

    if (!!one_col) return res.map(item => {

      if (Object.keys(item).length != 1) throw new Error('ожидается один столбец в результате запроса')
      return item[Object.keys(item)[0]]
    })
    
    else return res
}