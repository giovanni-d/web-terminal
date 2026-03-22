use pty_process::blocking::{Command as PtyCommand, Pty};
use pty_process::Size;
use std::io::{self, Read, Write};
use std::os::fd::AsRawFd;
use std::process::Child;

fn pty_err(e: pty_process::Error) -> io::Error {
    io::Error::other(e.to_string())
}

pub struct PtySession {
    pub pty: Pty,
    pub child: Child,
}

impl PtySession {
    pub fn spawn(cols: u16, rows: u16) -> io::Result<Self> {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        let pty = Pty::new().map_err(pty_err)?;
        pty.resize(Size::new(rows, cols)).map_err(pty_err)?;

        let pts = pty.pts().map_err(pty_err)?;
        let child = PtyCommand::new(&shell)
            .arg("-l")
            .env("TERM", "xterm-256color")
            .env("COLORTERM", "truecolor")
            .spawn(&pts)
            .map_err(pty_err)?;

        // Set non-blocking
        let fd = pty.as_raw_fd();
        unsafe {
            let flags = libc::fcntl(fd, libc::F_GETFL, 0);
            libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK);
        }

        Ok(Self { pty, child })
    }

    pub fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.pty.read(buf)
    }

    pub fn write_all(&mut self, data: &[u8]) -> io::Result<()> {
        self.pty.write_all(data)
    }

    pub fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        self.pty.resize(Size::new(rows, cols)).map_err(pty_err)
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for PtySession {
    fn drop(&mut self) {
        self.kill();
    }
}
