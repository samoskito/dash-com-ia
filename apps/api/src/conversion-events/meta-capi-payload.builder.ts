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
  const baseCustomData = input.customData ?? {};
  const purchaseDefaults =
    input.eventName === "Purchase"
      ? buildPurchaseCustomDataDefaults(input.eventId, baseCustomData)
      : {};
  const customData: ConversionEventCustomDataDto = {
    ...baseCustomData,
    ...purchaseDefaults,
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

function buildPurchaseCustomDataDefaults(
  eventId: string,
  customData: ConversionEventCustomDataDto
): Partial<ConversionEventCustomDataDto> {
  const defaults: Partial<ConversionEventCustomDataDto> = {};

  if (!customData.order_id) {
    defaults.order_id = eventId;
  }

  if (!customData.contents?.length) {
    return defaults;
  }

  if (!customData.content_type) {
    defaults.content_type = "product";
  }

  if (customData.num_items == null) {
    defaults.num_items = customData.contents.reduce(
      (total, item) => total + (item.quantity ?? 1),
      0
    );
  }

  return defaults;
}
