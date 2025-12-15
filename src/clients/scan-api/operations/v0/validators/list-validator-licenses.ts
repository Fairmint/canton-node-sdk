import { type operations } from '../../../../../generated/apps/scan/src/main/openapi/scan';
import { ScanApiOperation } from '../../../ScanApiOperation';

interface Params {
  after?: number;
  limit?: number;
}

type Response = operations['listValidatorLicenses']['responses']['200']['content']['application/json'];

/** List all validators currently approved by members of the DSO */
export class ListValidatorLicenses extends ScanApiOperation<Params | undefined, Response> {
  async execute(params?: Params): Promise<Response> {
    const validated = params ?? {};
    const queryParts: string[] = [];
    if (validated.after !== undefined) {
      queryParts.push(`after=${validated.after}`);
    }
    if (validated.limit !== undefined) {
      queryParts.push(`limit=${validated.limit}`);
    }
    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return this.makeGetRequest<Response>(`/api/scan/v0/admin/validator/licenses${queryString}`);
  }
}
