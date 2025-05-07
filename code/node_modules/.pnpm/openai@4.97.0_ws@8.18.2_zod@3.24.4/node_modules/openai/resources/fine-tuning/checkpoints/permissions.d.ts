import { APIResource } from "../../../resource.js";
import * as Core from "../../../core.js";
import { Page } from "../../../pagination.js";
export declare class Permissions extends APIResource {
    /**
     * **NOTE:** Calling this endpoint requires an [admin API key](../admin-api-keys).
     *
     * This enables organization owners to share fine-tuned models with other projects
     * in their organization.
     */
    create(fineTunedModelCheckpoint: string, body: PermissionCreateParams, options?: Core.RequestOptions): Core.PagePromise<PermissionCreateResponsesPage, PermissionCreateResponse>;
    /**
     * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
     *
     * Organization owners can use this endpoint to view all permissions for a
     * fine-tuned model checkpoint.
     */
    retrieve(fineTunedModelCheckpoint: string, query?: PermissionRetrieveParams, options?: Core.RequestOptions): Core.APIPromise<PermissionRetrieveResponse>;
    retrieve(fineTunedModelCheckpoint: string, options?: Core.RequestOptions): Core.APIPromise<PermissionRetrieveResponse>;
    /**
     * **NOTE:** This endpoint requires an [admin API key](../admin-api-keys).
     *
     * Organization owners can use this endpoint to delete a permission for a
     * fine-tuned model checkpoint.
     */
    del(fineTunedModelCheckpoint: string, permissionId: string, options?: Core.RequestOptions): Core.APIPromise<PermissionDeleteResponse>;
}
/**
 * Note: no pagination actually occurs yet, this is for forwards-compatibility.
 */
export declare class PermissionCreateResponsesPage extends Page<PermissionCreateResponse> {
}
/**
 * The `checkpoint.permission` object represents a permission for a fine-tuned
 * model checkpoint.
 */
export interface PermissionCreateResponse {
    /**
     * The permission identifier, which can be referenced in the API endpoints.
     */
    id: string;
    /**
     * The Unix timestamp (in seconds) for when the permission was created.
     */
    created_at: number;
    /**
     * The object type, which is always "checkpoint.permission".
     */
    object: 'checkpoint.permission';
    /**
     * The project identifier that the permission is for.
     */
    project_id: string;
}
export interface PermissionRetrieveResponse {
    data: Array<PermissionRetrieveResponse.Data>;
    has_more: boolean;
    object: 'list';
    first_id?: string | null;
    last_id?: string | null;
}
export declare namespace PermissionRetrieveResponse {
    /**
     * The `checkpoint.permission` object represents a permission for a fine-tuned
     * model checkpoint.
     */
    interface Data {
        /**
         * The permission identifier, which can be referenced in the API endpoints.
         */
        id: string;
        /**
         * The Unix timestamp (in seconds) for when the permission was created.
         */
        created_at: number;
        /**
         * The object type, which is always "checkpoint.permission".
         */
        object: 'checkpoint.permission';
        /**
         * The project identifier that the permission is for.
         */
        project_id: string;
    }
}
export interface PermissionDeleteResponse {
    /**
     * The ID of the fine-tuned model checkpoint permission that was deleted.
     */
    id: string;
    /**
     * Whether the fine-tuned model checkpoint permission was successfully deleted.
     */
    deleted: boolean;
    /**
     * The object type, which is always "checkpoint.permission".
     */
    object: 'checkpoint.permission';
}
export interface PermissionCreateParams {
    /**
     * The project identifiers to grant access to.
     */
    project_ids: Array<string>;
}
export interface PermissionRetrieveParams {
    /**
     * Identifier for the last permission ID from the previous pagination request.
     */
    after?: string;
    /**
     * Number of permissions to retrieve.
     */
    limit?: number;
    /**
     * The order in which to retrieve permissions.
     */
    order?: 'ascending' | 'descending';
    /**
     * The ID of the project to get permissions for.
     */
    project_id?: string;
}
export declare namespace Permissions {
    export { type PermissionCreateResponse as PermissionCreateResponse, type PermissionRetrieveResponse as PermissionRetrieveResponse, type PermissionDeleteResponse as PermissionDeleteResponse, PermissionCreateResponsesPage as PermissionCreateResponsesPage, type PermissionCreateParams as PermissionCreateParams, type PermissionRetrieveParams as PermissionRetrieveParams, };
}
//# sourceMappingURL=permissions.d.ts.map