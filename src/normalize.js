import camelCase from 'lodash/camelCase';
import isArray from 'lodash/isArray';
import isNull from 'lodash/isNull';
import keys from 'lodash/keys';
import merge from 'lodash/merge';
import omitBy from 'lodash/omitBy';

function wrap(json) {
  if (isArray(json)) {
    return json;
  }

  return [json];
}

function isDate(attributeValue) {
  return Object.prototype.toString.call(attributeValue) === '[object Date]';
}

function camelizeNestedKeys(attributeValue) {
  if (attributeValue === null || typeof attributeValue !== 'object' || isDate(attributeValue)) {
    return attributeValue;
  }

  if (isArray(attributeValue)) {
    return attributeValue.map(camelizeNestedKeys);
  }

  const copy = {};

  keys(attributeValue).forEach((k) => {
    copy[camelCase(k)] = camelizeNestedKeys(attributeValue[k]);
  });

  return copy;
}

function extractRelationships(relationships, { camelizeKeys, camelizeTypeValues }) {
  let ret = {};
  keys(relationships).forEach((key) => {
    const relationship = relationships[key];
    const name = camelizeKeys ? camelCase(key) : key;
    ret[name] = {};

    if (typeof relationship.data !== 'undefined') {
      if (isArray(relationship.data)) {
        ret[name].data = relationship.data.map(e => ({
          id: e.id,
          type: camelizeTypeValues ? camelCase(e.type) : e.type,
        }));
      } else if (!isNull(relationship.data)) {
        ret[name].data = {
          id: relationship.data.id,
          type: camelizeTypeValues ? camelCase(relationship.data.type) : relationship.data.type,
        };
      } else {
        ret[name].data = relationship.data;
      }

      if (typeof relationship.meta !== 'undefined') {
        ret[name].meta = camelizeNestedKeys(relationship.meta);
      }
    }

    if (relationship.links) {
      ret[name].links = camelizeKeys ? camelizeNestedKeys(relationship.links) : relationship.links;
    }
  });

  // Discard all empty relationship objects
  ret = omitBy(ret, v => v !== {})

  return ret;
}

function extractEntities(json, { camelizeKeys, camelizeTypeValues }) {
  const ret = {};

  wrap(json).forEach((elem) => {
    const type = camelizeKeys ? camelCase(elem.type) : elem.type;

    ret[type] = ret[type] || {};
    ret[type][elem.id] = ret[type][elem.id] || {
      id: elem.id,
    };
    ret[type][elem.id].type = camelizeTypeValues ? camelCase(elem.type) : elem.type;

    if (camelizeKeys) {
      ret[type][elem.id].attributes = {};

      keys(elem.attributes).forEach((key) => {
        ret[type][elem.id].attributes[camelCase(key)] = camelizeNestedKeys(elem.attributes[key]);
      });
    } else {
      ret[type][elem.id].attributes = elem.attributes;
    }

    if (elem.links) {
      ret[type][elem.id].links = {};

      keys(elem.links).forEach((key) => {
        const newKey = camelizeKeys ? camelCase(key) : key;
        ret[type][elem.id].links[newKey] = elem.links[key];
      });
    }

    if (elem.relationships) {
      ret[type][elem.id].relationships =
        extractRelationships(elem.relationships, { camelizeKeys, camelizeTypeValues });
    }

    if (elem.meta) {
      if (camelizeKeys) {
        ret[type][elem.id].meta = {};

        keys(elem.meta).forEach((key) => {
          ret[type][elem.id].meta[camelCase(key)] = camelizeNestedKeys(elem.meta[key]);
        });
      } else {
        ret[type][elem.id].meta = elem.meta;
      }
    }
  });

  return ret;
}

function doFilterEndpoint(endpoint) {
  return endpoint.replace(/\?.*$/, '');
}

function extractMetaData(json, endpoint, { camelizeKeys, camelizeTypeValues, filterEndpoint }) {
  const ret = {};

  ret.meta = {};

  let metaObject;

  if (!filterEndpoint) {
    const filteredEndpoint = doFilterEndpoint(endpoint);

    ret.meta[filteredEndpoint] = {};
    ret.meta[filteredEndpoint][endpoint.slice(filteredEndpoint.length)] = {};
    metaObject = ret.meta[filteredEndpoint][endpoint.slice(filteredEndpoint.length)];
  } else {
    ret.meta[endpoint] = {};
    metaObject = ret.meta[endpoint];
  }

  metaObject.data = {};

  if (json.data) {
    const meta = [];

    wrap(json.data).forEach((object) => {
      const pObject = {
        id: object.id,
        type: camelizeTypeValues ? camelCase(object.type) : object.type,
      };

      if (object.relationships) {
        pObject.relationships =
          extractRelationships(object.relationships, { camelizeKeys, camelizeTypeValues });
      }

      meta.push(pObject);
    });

    metaObject.data = meta;
  }

  if (json.links) {
    metaObject.links = json.links;
    ret.meta[doFilterEndpoint(endpoint)].links = json.links;
  }

  if (json.meta) {
    metaObject.meta = json.meta;
  }

  return ret;
}

export default function normalize(json, opts = {}) {
  const ret = {};
  const { endpoint } = opts;
  let { filterEndpoint, camelizeKeys, camelizeTypeValues } = opts;

  if (typeof filterEndpoint === 'undefined') {
    filterEndpoint = true;
  }

  if (typeof camelizeKeys === 'undefined') {
    camelizeKeys = true;
  }

  if (typeof camelizeTypeValues === 'undefined') {
    camelizeTypeValues = true;
  }

  if (json.data) {
    merge(ret, extractEntities(json.data, { camelizeKeys, camelizeTypeValues }));
  }

  if (json.included) {
    merge(ret, extractEntities(json.included, { camelizeKeys, camelizeTypeValues }));
  }

  if (endpoint) {
    const endpointKey = filterEndpoint ? doFilterEndpoint(endpoint) : endpoint;

    merge(ret, extractMetaData(json, endpointKey, {
      camelizeKeys,
      camelizeTypeValues,
      filterEndpoint,
    }));
  }

  return ret;
}
