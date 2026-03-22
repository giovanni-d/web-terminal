use serde::Deserialize;

pub const MSG_STDIN: u8 = 0x01;
pub const MSG_STDOUT: u8 = 0x02;
pub const MSG_RESIZE: u8 = 0x03;
pub const MSG_CONTROL: u8 = 0x04;

#[derive(Debug)]
pub enum ClientMessage {
    Stdin(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Unknown,
}

#[derive(Deserialize)]
struct ResizePayload {
    cols: u16,
    rows: u16,
}

pub fn decode(data: &[u8]) -> ClientMessage {
    if data.is_empty() {
        return ClientMessage::Unknown;
    }
    match data[0] {
        MSG_STDIN => ClientMessage::Stdin(data[1..].to_vec()),
        MSG_RESIZE => {
            if let Ok(r) = serde_json::from_slice::<ResizePayload>(&data[1..]) {
                ClientMessage::Resize { cols: r.cols, rows: r.rows }
            } else {
                ClientMessage::Unknown
            }
        }
        _ => ClientMessage::Unknown,
    }
}

pub fn encode_stdout(data: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(1 + data.len());
    buf.push(MSG_STDOUT);
    buf.extend_from_slice(data);
    buf
}

pub fn encode_control(event: &str, code: i32) -> Vec<u8> {
    let json = serde_json::json!({ "event": event, "code": code });
    let json_bytes = serde_json::to_vec(&json).unwrap();
    let mut buf = Vec::with_capacity(1 + json_bytes.len());
    buf.push(MSG_CONTROL);
    buf.extend_from_slice(&json_bytes);
    buf
}
