export interface ConnectOfferMessage {
    sdp: RTCSessionDescriptionInit,
    fromNodeId: string,
    toNodeId: string,
    type: 'CONNECT_OFFER',
    peerId: string,
    createdTimestamp: number,
}