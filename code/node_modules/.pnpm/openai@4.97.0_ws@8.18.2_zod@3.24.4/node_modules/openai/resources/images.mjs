// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../resource.mjs";
import * as Core from "../core.mjs";
export class Images extends APIResource {
    /**
     * Creates a variation of a given image. This endpoint only supports `dall-e-2`.
     */
    createVariation(body, options) {
        return this._client.post('/images/variations', Core.multipartFormRequestOptions({ body, ...options }));
    }
    /**
     * Creates an edited or extended image given one or more source images and a
     * prompt. This endpoint only supports `gpt-image-1` and `dall-e-2`.
     */
    edit(body, options) {
        return this._client.post('/images/edits', Core.multipartFormRequestOptions({ body, ...options }));
    }
    /**
     * Creates an image given a prompt.
     * [Learn more](https://platform.openai.com/docs/guides/images).
     */
    generate(body, options) {
        return this._client.post('/images/generations', { body, ...options });
    }
}
//# sourceMappingURL=images.mjs.map