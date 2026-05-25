import WebSocket from "ws";

export class OrderBookStream {
  private socket?: WebSocket;

  connect(url: string, onMessage: (message: unknown) => void): void {
    this.socket = new WebSocket(url);
    this.socket.on("message", (data) => {
      try {
        onMessage(JSON.parse(data.toString()));
      } catch {
        onMessage(data.toString());
      }
    });
  }

  close(): void {
    this.socket?.close();
  }
}
