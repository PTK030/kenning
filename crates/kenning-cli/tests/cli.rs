use std::path::PathBuf;

use assert_cmd::Command;
use predicates::str::contains;

const BINANCE: &str = "0x28C6c06298d514Db089934071355E5743bf21d60";
/// Same first 6 and last 4 characters as `BINANCE`.
const LOOKALIKE: &str = "0x28c6c0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1d60";

struct Home(PathBuf);

impl Home {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("ken-cli-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Home(dir)
    }

    fn ken(&self) -> Command {
        let mut c = Command::cargo_bin("ken").unwrap();
        c.env("KENNING_HOME", &self.0).env("NO_COLOR", "1");
        c
    }
}

impl Drop for Home {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn exit_codes_follow_the_state() {
    let h = Home::new("exit");
    h.ken()
        .args(["add", BINANCE, "Binance", "--note", "my deposits"])
        .assert()
        .success();

    h.ken()
        .arg(BINANCE)
        .assert()
        .code(0)
        .stdout(contains("Binance"))
        .stdout(contains("my deposits"));
    h.ken()
        .arg(LOOKALIKE)
        .assert()
        .code(20)
        .stdout(contains("This is not your Binance address."))
        .stdout(contains("Matches 6 + 4 characters"));
    h.ken()
        .arg("bc1q85xw6lu0q98jxuql5deskkcy49jjafnp2sdtp8")
        .assert()
        .code(10)
        .stdout(contains("New address"));
    h.ken()
        .arg("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u")
        .assert()
        .code(2)
        .stderr(contains("invalid checksum"));
    h.ken().arg("hello").assert().code(2);
}

#[test]
fn check_reads_stdin_and_reports_the_worst_state() {
    let h = Home::new("check");
    h.ken().args(["add", BINANCE, "Binance"]).assert().success();
    let text = format!("router 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45\nsend to {LOOKALIKE}\n");
    h.ken()
        .args(["check", "-"])
        .write_stdin(text)
        .assert()
        .code(20)
        .stdout(contains("Uniswap V3: Router 2"))
        .stdout(contains("lookalike"));
}

#[test]
fn json_output_is_parseable() {
    let h = Home::new("json");
    let out = h
        .ken()
        .args(["--json", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"])
        .assert()
        .code(0)
        .get_output()
        .stdout
        .clone();
    let v: serde_json::Value = serde_json::from_slice(&out).unwrap();
    assert_eq!(v["state"], "public");
    assert_eq!(v["label"], "USDT (TRC-20)");
}

#[test]
fn export_import_round_trip_and_safe_csv() {
    let h = Home::new("csv");
    h.ken()
        .args(["add", BINANCE, "Binance, main", "--owner", "contact"])
        .assert()
        .success();
    let csv_path = h.0.join("out.csv");
    h.ken().args(["export", "-o"]).arg(&csv_path).assert().success();

    let h2 = Home::new("csv2");
    h2.ken()
        .arg("import")
        .arg(&csv_path)
        .assert()
        .success()
        .stdout(contains("1 new"));
    h2.ken()
        .arg(BINANCE)
        .assert()
        .code(0)
        .stdout(contains("Binance, main"))
        .stdout(contains("contact"));

    let safe = h2.0.join("safe.csv");
    std::fs::write(
        &safe,
        "address,name,chainId\n0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed,Payroll,1\n",
    )
    .unwrap();
    h2.ken()
        .arg("import")
        .arg(&safe)
        .args(["--owner", "team"])
        .assert()
        .success();
    h2.ken()
        .arg("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed")
        .assert()
        .code(0)
        .stdout(contains("Payroll"));
}

#[test]
fn rm_and_log() {
    let h = Home::new("rm");
    h.ken().args(["add", BINANCE, "Binance"]).assert().success();
    h.ken().args(["rm", BINANCE]).assert().success();
    h.ken().args(["rm", BINANCE]).assert().code(2);
    h.ken()
        .arg("log")
        .assert()
        .success()
        .stdout(contains("added"))
        .stdout(contains("removed"));
}

#[test]
fn diff_highlights() {
    let h = Home::new("diff");
    h.ken()
        .args(["diff", BINANCE, LOOKALIKE])
        .assert()
        .code(1)
        .stdout(contains("Matches 6 + 4 characters"));
    h.ken()
        .args(["diff", BINANCE, &BINANCE.to_lowercase()])
        .assert()
        .code(0)
        .stdout(contains("Same address"));
}

#[test]
fn serve_speaks_json_rpc() {
    let h = Home::new("serve");
    let input = format!(
        "{}\n{}\n{}\n",
        serde_json::json!({"jsonrpc":"2.0","id":1,"method":"add","params":{"address":BINANCE,"label":"Binance"}}),
        serde_json::json!({"jsonrpc":"2.0","id":2,"method":"observe","params":{"text":LOOKALIKE}}),
        serde_json::json!({"jsonrpc":"2.0","id":3,"method":"nope"}),
    );
    let out = h
        .ken()
        .args(["serve", "--stdio"])
        .write_stdin(input)
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    let lines: Vec<serde_json::Value> = String::from_utf8(out)
        .unwrap()
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines.len(), 3);
    assert_eq!(lines[0]["result"]["added"], true);
    assert_eq!(lines[1]["result"]["state"], "lookalike");
    assert!(
        lines[2]["error"]["message"]
            .as_str()
            .unwrap()
            .contains("unknown method")
    );
}
