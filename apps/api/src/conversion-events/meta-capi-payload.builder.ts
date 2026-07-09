import type {
  ConversionEventCustomDataDto,
  ConversionEventNameDto
} from "@wpptrack/shared";

export type MetaCapiPayloadInput = {
  eventName: ConversionEventNameDto;
  eventTime: Date;
  eventId: string;
  phoneHash: string;
  ctwaClid: string;
  pageId: string;
  adId: string;
  valueCents?: number | null;
  currency?: string | null;
  contentName?: string | null;
  customData?: ConversionEventCustomDataDto | null;
  testEventCode?: string | null;
};

export type MetaCapiPayload = {
  data: Array<{
    event_name: string;
    event_time: number;
    event_id: string;
    action_source: "business_messaging";
    messaging_channel: "whatsapp";
    user_data: {
      ph: string[];
      ctwa_clid: string;
      page_id: string;
    };
    custom_data: ConversionEventCustomDataDto;
  }>;
  test_event_code?: string;
};

export function buildMetaCapiPayload(
  input: MetaCapiPayloadInput
): MetaCapiPayload {
  const customData: ConversionEventCustomDataDto = {
    ...(input.customData ?? {}),
    ad_id: input.adId,
    ...(typeof input.valueCents === "number"
      ? { value: input.valueCents / 100 }
      : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.contentName ? { content_name: input.contentName } : {})
  };

  return {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.eventId,
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: {
          ph: [input.phoneHash],
          ctwa_clid: input.ctwaClid,
          page_id: input.pageId
        },
        custom_data: customData
      }
    ],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {})
  };
}
