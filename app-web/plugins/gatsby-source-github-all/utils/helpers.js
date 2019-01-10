/*
Copyright 2018 Province of British Columbia

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at 

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Created by Patrick Simonian
*/
const { TypeCheck } = require('@bcgov/common-web-utils'); // eslint-disable-line
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const chalk = require('chalk');
const shorthash = require('shorthash');
const stringSimilarity = require('string-similarity');
const scrape = require('html-metadata');
const validUrl = require('valid-url');
const { RESOURCE_TYPES_LIST, UNFURL_TYPES } = require('./constants');

/**
 * returns an idempotent path based on a base path plus a digestable string that is hashed
 * @param {String} base the base path (which is not changed)
 * @param  {...String} digestables comma seperated list of strings which are dsigested by shorthash
 * @returns {String} ie (/mypath, file.md) => /mypath/123dsfakjhdf
 */
const createPathWithDigest = (base, ...digestables) => {
  if (!TypeCheck.isString(base)) {
    throw new Error('base must be a string');
  }
  if (!digestables.every(TypeCheck.isString)) {
    throw new Error('digestable must be a string');
  }

  const normalizedBase = base.replace(/^\//, '').replace(/\/$/, '');
  const digested = shorthash.unique(digestables.join(''));

  return path.join('/', normalizedBase, digested);
};

/**
 * Creates Standardized Unfurl meta data
 * @param {String} type
 * @param {Object} unfurledData
 */
const createUnfurlObj = (
  type,
  { label1, data1, label2, data2, description, title, image, author },
) => {
  if (!TypeCheck.isString(type)) {
    throw new Error('type must be a string!');
  }

  return {
    type,
    label1,
    data1,
    label2,
    data2,
    image,
    title,
    description,
    author,
  };
};

/**
 * returns the closest resourceType from the constant resourceTypes array based on the
 * uncontrolled resourceType (given to us by contributors)
 * @param {String} resourceType the resource type provided by a specific piece of content
 */
const getClosestResourceType = resourceType => {
  // if its blank don't bother checking closeness
  if (resourceType === '') return '';
  const matches = stringSimilarity.findBestMatch(resourceType, RESOURCE_TYPES_LIST);
  // only return the best match if its greater than .5 in similarity
  return matches.bestMatch.rating >= 0.5 ? matches.bestMatch.target : '';
};

/**
 * returns the closest persona from the array of personas based on the
 * uncontrolled persona (given to us by contributors)
 * @param {Array} personas the personas provided by a specific piece of content
 * @param {Array} personas the valid personas list
 */
const getClosestPersona = (personaList, personas) => {
  const RATING_THRESHOLD = 0.5; // rating is between 0 - 1, we only want a match if it's greater than half.
  // if its blank don't bother checking closeness
  if (personaList.length === 0) return [];

  return personaList.map(p => {
    const matches = stringSimilarity.findBestMatch(p, personas);
    return matches.bestMatch.rating >= RATING_THRESHOLD ? matches.bestMatch.target : '';
  });
};

/**
 * returns a new absolute path based off of a relative position from the given absolute path
 * @param {String} relativePath eg '../../something/something.txt'
 * @param {String} absolutePath eg 'https://example.com/'
 * @param {Object} queryParams a key value pair set of query parameters
 */
const getAbsolutePathFromRelative = (relativePath, absolutePath, queryParams) => {
  const { URL } = url;
  const absPath = url.resolve(absolutePath, relativePath);

  const absPathObj = new URL(absPath);

  Object.keys(queryParams).forEach(key => {
    absPath.searchParams.set(key, queryParams[key]);
  });

  return absPathObj.toString();
};

/**
 * validates an object against a schema
 * schema is in format
 * {
 *  [object key name] : {
 *    type: [object constructor String | Array | Object etc],
 *    required: [Boolean]
 *  }
 * }
 * @param {Object} obj the object that is being tested
 * @param {Object} schema the schema object that is being tested against
 * @returns {Object} an object containing error messages and isValid property
 * {
 *   errors: {Array},
 *   isValid: {Boolean}
 * }
 */
const validateAgainstSchema = (obj, schema) => {
  const error = {
    messages: [],
  };

  Object.keys(schema).every(key => {
    const schemaItem = schema[key];
    let isValid = true;
    if (schemaItem.required) {
      isValid =
        Object.prototype.hasOwnProperty.call(obj, key) && TypeCheck.isA(schemaItem.type, obj[key]);
      // does this source property have it anyways?
    } else if (Object.prototype.hasOwnProperty.call(obj, key)) {
      isValid = TypeCheck.isA(schemaItem.type, obj[key]);
    }

    if (!isValid) {
      error.messages.push(
        `Error Validating Source: failed on property ${key}, received value ${obj[key]}`,
      );
    }
    return isValid;
  });

  error.isValid = error.messages.length === 0;

  return error;
};

/**
 * verifies registry item against schema
 * @param {Object} registryItem the registry item
 * @param {Object} schema the schema to test against
 * @returns {Boolean}
 */
const validateRegistryItemAgainstSchema = (registryItem, schema) => {
  const error = validateAgainstSchema(registryItem, schema);
  if (!error.isValid) {
    console.error(
      chalk`{red.bold \nError Validating Registry item}`,
      '\n',
      error.messages.join('\n-'),
    );
  }

  return error.isValid;
};

/* validates a registry item's source Properties against a valid schema
 * @param {Object} source the registry source item properties
 * @param {Object} schema has shape { type: String | Boolean | Date etc, required: true/false}
 * @returns {Boolean}
 */
const validateSourcePropertiesAgainstSchema = (source, schema) => {
  const error = validateAgainstSchema(source.sourceProperties, schema);
  if (!error.isValid) {
    console.error(
      chalk`{red.bold \nError Validating Source type ${source.sourceType}}`,
      '\n',
      error.messages.join('\n-'),
    );
  }

  return error.isValid;
};

const unfurlWebURI = async uri => {
  // if is not valid uri throw
  if (!uri || !validUrl.isUri(uri)) {
    throw new Error('The uri is not valid');
  }
  const data = await scrape(uri);

  // metadata comes in with properties for each type of unfurl spec (twitter, openGraph etc)
  const combinedData = { ...data.general, ...data.twitter, ...data.openGraph };
  // update image to have resource path prepended to it if it is not https
  if (TypeCheck.isString(combinedData.image)) {
    combinedData.image = url.resolve(uri, combinedData.image);
  } else if (
    TypeCheck.isObject(combinedData.image) &&
    Object.prototype.hasOwnProperty.call(combinedData.image, 'url')
  ) {
    // sometimes the image property from opengraph or twitter card comes in from scrape as
    // .url property
    combinedData.image = combinedData.image.url;
  }
  return createUnfurlObj(UNFURL_TYPES.EXTERNAL, combinedData);
};

/**
 * returns a md5 hash
 * @param {String} content the string to be hashed
 * @returns {String} the hash
 */
const hashString = content =>
  crypto
    .createHash('md5')
    .update(content)
    .digest('hex');

/**
 * returns true/false if source contains more sources
 * @param {Object} source
 * @returns {Boolean}
 */
const isSourceCollection = source =>
  Object.prototype.hasOwnProperty.call(source.sourceProperties, 'sources') &&
  TypeCheck.isArray(source.sourceProperties.sources);

module.exports = {
  hashString,
  createPathWithDigest,
  createUnfurlObj,
  getClosestResourceType,
  getClosestPersona,
  getAbsolutePathFromRelative,
  validateSourcePropertiesAgainstSchema,
  validateRegistryItemAgainstSchema,
  unfurlWebURI,
  isSourceCollection,
};
