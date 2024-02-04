import { IMap } from './oraidex.types';

export const convertRawLogEventsToMapOfEvents = (
  eventsLog: Array<any>
): IMap<string, any> => {
  const output = IMap<string, any>().asMutable();
  for (const eventLog of eventsLog) {
    const bundleIndex = eventLog['msg_index'];
    const events = eventLog['events'];
    for (const event of events) {
      for (const attribute of event.attributes) {
        output.setIn([bundleIndex, event.type, attribute.key], attribute.value);
      }
    }
  }

  return output;
};
