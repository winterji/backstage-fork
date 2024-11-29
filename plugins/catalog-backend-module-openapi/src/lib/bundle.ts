/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {
  $RefParser,
  ParserOptions,
  ResolverOptions,
} from '@apidevtools/json-schema-ref-parser';
import { parse, stringify } from 'yaml';
import * as path from 'path';

const protocolPattern = /^(\w{2,}):\/\//i;
const getProtocol = (refPath: string) => {
  const match = protocolPattern.exec(refPath);
  if (match) {
    return match[1].toLowerCase();
  }
  return undefined;
};

export type BundlerRead = (url: string) => Promise<Buffer>;

export type BundlerResolveUrl = (url: string, base: string) => string;

const translateLocations: {
  'http-responses-v2.yaml': string;
  'xxcustom-dto-v3.yaml': string;
  'problem-dto-v2.yaml': string;
  'recalculate-transaction-service-api-v2-common.yaml': string;
  'pce-promotion-dto-v1.yaml': string;
} = {
  'http-responses-v2.yaml':
    'https://gitlab.gk.gk-software.com/rest-apis/common-rest-api/-/blob/master/src/main/resources/openapi/http-responses-v2.yaml?ref_type=heads',
  'xxcustom-dto-v3.yaml':
    'https://gitlab.gk.gk-software.com/product/domains/basket-calculation/pricing-engine/promotion-domain-common-api/-/blob/master/src/main/resources/openapi/common/xxcustom-dto-v3.yaml?ref_type=heads',
  'problem-dto-v2.yaml':
    'https://gitlab.gk.gk-software.com/product/domains/basket-calculation/pricing-engine/promotion-domain-common-api/-/blob/master/src/main/resources/openapi/common/problem-dto-v2.yaml?ref_type=heads',
  'recalculate-transaction-service-api-v2-common.yaml':
    'https://gitlab.gk.gk-software.com/product/domains/basket-calculation/pricing-engine/promotion-domain-common-api/-/blob/master/src/main/resources/openapi/recalculate-transaction-service-api-v2-common.yaml?ref_type=heads',
  'pce-promotion-dto-v1.yaml':
    'https://gitlab.gk.gk-software.com/rest-apis/promotion-rest-api/-/blob/master/src/main/resources/openapi/pce-promotion-dto-v1.yaml?ref_type=heads',
};

export async function bundleFileWithRefs(
  fileWithRefs: string,
  baseUrl: string,
  read: BundlerRead,
  resolveUrl: BundlerResolveUrl,
): Promise<string> {
  const fileUrlReaderResolver: ResolverOptions = {
    canRead: file => {
      const protocol = getProtocol(file.url);
      return protocol === undefined || protocol === 'file';
    },
    read: async file => {
      const relativePath = path.relative('.', file.url);
      const url = resolveUrl(relativePath, baseUrl);
      return await read(url);
    },
  };
  const httpUrlReaderResolver: ResolverOptions = {
    canRead: ref => {
      const protocol = getProtocol(ref.url);
      return protocol === 'http' || protocol === 'https';
    },
    read: async ref => {
      let urlPom = resolveUrl(ref.url, baseUrl);
      for (const key in translateLocations) {
        if (urlPom.endsWith(key)) {
          console.log('------- Found known location');
          urlPom = translateLocations[key as keyof typeof translateLocations];

          const readUrl = await read(urlPom);
          return readUrl;
        }
      }
      const url = urlPom;
      return await read(url);
    },
  };

  function subParseCustomLocations(strFile: string) {
    // cycle through all known locations
    let index = 0;
    let counter = 0;
    let pomStr = strFile;
    while (pomStr.includes('http-responses-v2.yaml', index)) {
      index = pomStr.indexOf('http-responses-v2.yaml', index);
      if (pomStr.charAt(index - 1) !== '/') {
        const before = pomStr.slice(0, index);
        const after = pomStr.slice(index + 22);
        pomStr = before + translateLocations['http-responses-v2.yaml'] + after;
        // strFile.replace("http-responses-v2.yaml", translateLocations["http-responses-v2.yaml"])
        console.log(`replaced ${++counter}`);
        index += translateLocations['http-responses-v2.yaml'].length;
      } else {
        index += 22;
      }
    }
    return pomStr;
  }

  const options: ParserOptions = {
    continueOnError: false,
    resolve: {
      file: fileUrlReaderResolver,
      http: httpUrlReaderResolver,
    },
  };

  // const subParsed = subParseCustomLocations(fileWithRefs);
  // console.log(subParsed);
  const fileObject = parse(fileWithRefs);

  // const resolved = await $RefParser.resolve(baseUrl, fileObject, options)
  // console.log("resolved paths:")
  // console.log(resolved.paths())
  // console.log("resolved values:")
  // console.log(resolved.values(["file", "http"]))

  // console.log("baseUrl before bundle: " + baseUrl)
  // console.log("before bundle:")
  // console.log(fileObject.paths['/v1/calculate-points'].post.responses);
  const bundledObject = await $RefParser.bundle(baseUrl, fileObject, options);
  console.log('after bundle:');
  console.log(bundledObject);
  return stringify(bundledObject);
}
