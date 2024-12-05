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
import { JsonObject } from '@backstage/types';

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

export async function bundleFileWithRefs(
  fileWithRefs: string,
  baseUrl: string,
  read: BundlerRead,
  resolveUrl: BundlerResolveUrl,
  mappedLocations: JsonObject | undefined,
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
      if (mappedLocations) {
        for (const key in mappedLocations) {
          if (urlPom.endsWith(key)) {
            console.log(`------- Found known location for: ${key}`);
            urlPom = mappedLocations[
              key as keyof typeof mappedLocations
            ] as string;

            const readUrl = await read(urlPom);
            return readUrl;
          }
        }
      }
      const url = urlPom;
      return await read(url);
    },
  };

  const options: ParserOptions = {
    continueOnError: false,
    resolve: {
      file: fileUrlReaderResolver,
      http: httpUrlReaderResolver,
    },
  };

  console.log(mappedLocations);

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
  // console.log('after bundle:');
  // console.log(bundledObject);
  return stringify(bundledObject);
}
