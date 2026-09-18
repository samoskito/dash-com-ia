CREATE TABLE "UazapiChatLabelState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "whatsappInstanceId" TEXT NOT NULL,
    "contactKey" TEXT NOT NULL,
    "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UazapiChatLabelState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UazapiChatLabelState_workspaceId_whatsappInstanceId_contactKey_key" ON "UazapiChatLabelState"("workspaceId", "whatsappInstanceId", "contactKey");
CREATE INDEX "UazapiChatLabelState_workspaceId_whatsappInstanceId_idx" ON "UazapiChatLabelState"("workspaceId", "whatsappInstanceId");

ALTER TABLE "UazapiChatLabelState" ADD CONSTRAINT "UazapiChatLabelState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UazapiChatLabelState" ADD CONSTRAINT "UazapiChatLabelState_whatsappInstanceId_fkey" FOREIGN KEY ("whatsappInstanceId") REFERENCES "WhatsappInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
