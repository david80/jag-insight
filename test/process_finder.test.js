const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parsePosixProcessList,
  parseWindowsProcessList,
  parseLsofPorts,
  parseWindowsNetstatPorts,
  selectLanguageServerProcess
} = require('../src/process_finder');

test('parses macOS and Linux process listings without grep', () => {
  const processes = parsePosixProcessList([
    '  101 /usr/bin/unrelated --flag',
    '  202 /Applications/Antigravity/language_server_macos_arm --extension_server_port=42100 --csrf_token abc-123'
  ].join('\n'));

  assert.deepEqual(processes, [{
    pid: 202,
    commandLine: '/Applications/Antigravity/language_server_macos_arm --extension_server_port=42100 --csrf_token abc-123'
  }]);
});

test('parses Windows PowerShell process JSON', () => {
  const processes = parseWindowsProcessList(JSON.stringify([{
    ProcessId: 303,
    CommandLine: 'C:\\Program Files\\Antigravity\\language_server_windows_x64.exe --api_server_port 43100'
  }, {
    ProcessId: 404,
    CommandLine: 'C:\\Windows\\System32\\notepad.exe'
  }]));

  assert.equal(processes.length, 1);
  assert.equal(processes[0].pid, 303);
  assert.match(processes[0].commandLine, /--api_server_port 43100/);
});

test('selects the language server associated with a Windows workspace', () => {
  const processes = [{
    pid: 1,
    commandLine: 'language_server_windows_x64.exe --workspace file_C__Users_Jane_other --extension_server_port=41000'
  }, {
    pid: 2,
    commandLine: 'language_server_windows_x64.exe --workspace file_C__Users_Jane_project_app --extension_server_port=42000'
  }];

  const selected = selectLanguageServerProcess(processes, 'C:\\Users\\Jane\\project\\app');
  assert.equal(selected.pid, 2);
});

test('parses listening ports from lsof and Windows netstat', () => {
  assert.deepEqual(parseLsofPorts([
    'language 202 jane 10u IPv4 0x TCP 127.0.0.1:42101 (LISTEN)',
    'language 202 jane 11u IPv6 0x TCP [::1]:42102 (LISTEN)'
  ].join('\n')), [42101, 42102]);

  const netstat = [
    '  TCP    127.0.0.1:43101    0.0.0.0:0    LISTENING    303',
    '  TCP    [::1]:43102        [::]:0       LISTENING    303',
    '  TCP    127.0.0.1:49999    0.0.0.0:0    LISTENING    999'
  ].join('\r\n');
  assert.deepEqual(parseWindowsNetstatPorts(netstat, 303), [43101, 43102]);
});
