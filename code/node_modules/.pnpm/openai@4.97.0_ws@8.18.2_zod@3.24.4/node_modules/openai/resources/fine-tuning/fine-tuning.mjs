// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.
import { APIResource } from "../../resource.mjs";
import * as CheckpointsAPI from "./checkpoints/checkpoints.mjs";
import { Checkpoints } from "./checkpoints/checkpoints.mjs";
import * as JobsAPI from "./jobs/jobs.mjs";
import { FineTuningJobEventsPage, FineTuningJobsPage, Jobs, } from "./jobs/jobs.mjs";
export class FineTuning extends APIResource {
    constructor() {
        super(...arguments);
        this.jobs = new JobsAPI.Jobs(this._client);
        this.checkpoints = new CheckpointsAPI.Checkpoints(this._client);
    }
}
FineTuning.Jobs = Jobs;
FineTuning.FineTuningJobsPage = FineTuningJobsPage;
FineTuning.FineTuningJobEventsPage = FineTuningJobEventsPage;
FineTuning.Checkpoints = Checkpoints;
//# sourceMappingURL=fine-tuning.mjs.map