//@ts-nocheck
const readline = require("readline");
const fs = require("fs");
const c = require("chalk");
const { log } = console;
const { EventEmitter } = require("events");
const utils = require("./utils");

const emitter = new EventEmitter();
process.setMaxListeners(0);
emitter.setMaxListeners(0);

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

/**
 * @param {string} file
 * @returns {string[]}
 */
const getHistory = (file) =>
  fs
    .readFileSync(file, "utf8")
    .split(/r?\n/)
    .reverse()
    .filter((o) => o !== "");

/**
 * only logs if eventName dont have none listeners
 * @param {string} eventName
 * @param {any[]} data
 */
const logl = (eventName, ...data) => {
  if (emitter.listenerCount(eventName) < 1) {
    log(...data);
  }
};

class creply {
  /**
   * create a new repl
   * @param {options} options the creply options
   * @typedef {{ name: string; version: string; description: string; history: string; prefix: string; prompt: string }} options
   * @constructor
   * @example
   * ```js
   * const creply = require("creply");
   * const repl = new creply({
   * 	name: "app",
   * 	version: "1.0.0",
   * 	description: "my repl",
   * 	history: "./history.txt",
   * 	prefix: "!",
   * 	prompt: "> "
   * });
   * ```
   */
  constructor(options) {
    /** @type {options} */
    this.options = options;
    /** 
		    all the commands created by the creply.addCommand method
		    @type command
				@typedef {{ [name: string]: { description: string; usage: () => string; exec: (args: any) => void }}} command
    */
    this.commands = {};
  }
  /**
   * the readline.Interface instance
   * @returns {Promise<string>}
   * @param {string} history - history file
   */
  async rl(history) {
    if (!fs.existsSync(history)) fs.appendFileSync(history, "");
    var rlHistory = getHistory(history);
    global.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      history: rlHistory,
      historySize: rlHistory.length,
      removeHistoryDuplicates: true
    });
    return new Promise((resolve, reject) => {
      global.rl.question(this.options.prompt, (line) => {
        resolve(line);
        global.rl.close();
      });
    });
  }
  /**
   * @typedef {"command" | "exit" | "start" | "uncaught-error" | "keypress" | "line" | "cursor-move" | "command-not-found" | "command-not-specified" | "did-you-mean" | "unhandled-rejection"} events eventName
   * @param {events} eventName
   * @param {any} listener
   * @example
   * ```js
   * repl.on("keypress", (char, key) => {
   *   console.log("key press:",key.name)
   * });
   * ```
   */
  on(eventName, listener) {
    if (!listener)
      new utils.error({
        message: `the listener callback cannot be undefined`
      });
    if (typeof listener !== "function")
      new utils.error({
        message: `the listener callback must be a function`
      });
    if (!eventName)
      new utils.error({
        message: `the eventName cannot be undefined`
      });
    var eventsArray = [
      "command",
      "exit",
      "start",
      "uncaught-error",
      "keypress",
      "line",
      "cursor-move",
      "command-not-found",
      "command-not-specified",
      "did-you-mean",
      "unhandled-rejection"
    ];
    //check if eventName is a valid event
    if (!eventsArray.includes(eventName))
      new utils.error({
        message: `the event ${c.yellow(
          eventName
        )} is not a valid event valid events are -> ${c.yellow(
          eventsArray.join(c.gray(", "))
        )}`
      });
    emitter.on(eventName, listener);
  }
  /**
   * starts the repl
   * @returns {Promise<void>}
   * @example
   * ```js
   * repl.start() // will start the repl
   * ```
   */
  async start() {
    emitter.emit("start");
    this.handler();
    var options = this.options;
    process.stdin.on("keypress", (ch, key) => {
      if (key.ctrl && key.name === "c") {
        process.exit();
      }
      /**
       * @event keypress
       * @type {cols: number; rows: number}
       */
      const cursor = global.rl.getCursorPos();
      /**
       * @event keypress
       * @type {any}
       */
      const char = ch;
      /**
       * @event keypress
       * @type { sequence: string; name: string; ctrl: boolean; meta: boolean; shift: boolean }
       */
      const pressKey = key;
      emitter.emit("keypress", char, pressKey);
      emitter.emit("cursor-move", cursor);
    });
    while (true) {
      var rl = this.rl(options.history);
      const line = await rl;
      emitter.emit("line", line);
      fs.appendFileSync(options.history, "\n" + line);
      if (line.startsWith(options.prefix)) this.eval(line);
    }
  }
  /**
   * evals the repl input line
   * @param {string} line
   * @example
   * ```js
   * repl.eval("!help") // will eval the command "help"
   * ```
   * @returns {void}
   */
  eval(line) {
    const options = this.options;
    const data = line.replace(options.prefix, "").split(" ");
    const command = data[0];
    const args = data.slice(1).join("");
    if (command !== "") {
      if (command === "help") {
        this.help();
      } else if (command === "clear") this.clear();
      else if (command === "exit") this.exit();
      else if (command === "usage") this.usage(args);
      else {
        if (command in this.commands) {
          emitter.emit("command", command, args);
          //if the command was removed this if is required
          if (this.commands[command]) this.commands[command].exec(args);
        } else {
          var mean = utils.findMean(command, [
            "help",
            "clear",
            "exit",
            ...Object.keys(this.commands)
          ]);
          //.filter((o) => o !== undefined);
          emitter.emit("command-not-found", command);
          logl(
            "command-not-found",
            c.red("command not found:"),
            c.blue(command)
          );
          if (mean.length > 0) {
            emitter.emit("did-you-mean", command, mean);
            logl("did-you-mean", c.red("did you mean:"));
            mean.forEach((o) => log(` ${c.blue(o)}`));
          }
        }
      }
    } else {
      emitter.emit("command-not-specified");
      logl("", c.red("error"), c.gray("command not specified"));
    }
  }
  /**
   * prints the help
   * @example
   * ```js
   * repl.help() // will print the help
   * ```
   * @returns {void}
   */
  help() {
    log(c.bold(`welcome to ${this.options.name} ${this.options.version}`));
    log(c.gray(this.options.description));
    log(c.gray(`use the prefix ${c.blue(this.options.prefix)} for commands`));
    log(c.bold("commands:"));
    var cmdKeys = Object.keys(this.commands);
    cmdKeys.length > 0
      ? cmdKeys.forEach((o) => {
          log(` ${c.blue(o)} - ${this.commands[o].description}`);
        })
      : log(c.red(" no commands"));
    log(c.bold("system commands:"));
    log(` ${c.blue("help")} - show this help`);
    log(` ${c.blue("clear")} - clear the screen`);
    log(` ${c.blue("exit")} - exit the repl`);
    log(` ${c.blue("usage")} - show usage of the commands`);
  }
  /**
   * clears the screen
   * @example
   * ```js
   * repl.clear() // will clear the screen
   * ```
   * @returns {void}
   */
  clear() {
    process.stdout.write("\x1Bc");
  }
  /**
   * exits the repl
   * @example
   * ```js
   * repl.exit() // will exit the repl
   * ```
   * @returns {void}
   */
  exit() {
    process.exit(0);
  }
  /**
   * show usage of a command
   * only works with user commands
   * @param {string} command the name of the command
   * @example
   * ```js
   * repl.usage("say") // will show the usage of the command "say"
   * ```
   * @returns {void}
   */
  usage(command) {
    if (command in this.commands) {
      log(this.commands[command].usage());
    } else {
      if (command == "") {
        emitter.emit("command-not-specified");
        logl(
          "command-not-specified",
          c.red("error"),
          c.gray("command not specified")
        );
      } else {
        emitter.emit("command-not-found", command);
        logl("command-not-found", c.red("command not found:"), c.blue(command));
        var mean = utils.findMean(command, Object.keys(this.commands));
        if (mean.length > 0) {
          emitter.emit("did-you-mean", mean);
          logl("did-you-mean", c.red("did you mean:"));
          mean.forEach((o) => log(` ${c.blue(o)}`));
        }
      }
    }
  }
  /**
   * handle things like:
   * - on process exit
   * - on errors
   * - on unhandled rejections
   */
  handler() {
    process.on("exit", (code) => {
      emitter.emit("exit", code);
      logl(
        "exit",
        `\n${c.blue(this.options.name)} ${c.bold(
          "exited with status"
        )} ${c.blue(code)}`
      );
    });
    process.on("uncaughtException", (e) => {
      if (e.name === "replError") {
        log(
          `\n${c.red(e.name)} ${c.bold(e.message.replaceAll(":", ""))} ${c.gray(
            e.stack
              .replaceAll(e.name, "")
              .replaceAll(e.message, "")
              .replace(":", "")
          )}`
        );
        process.exit(1);
      } else {
        log(
          `\n${c.red(e.name)} ${c.bold(e.message)} ${c.gray(
            e.stack.replaceAll(e.name, "").replaceAll(e.message, "")
          )}`.replace(":", "")
        );
        emitter.emit("uncaught-error", e);
        //resumes the prompt after an error
        process.stdin.write(this.options.prompt);
      }
    });
    process.on("unhandledRejection", async (reason, p) => {
      emitter.emit("unhandled-rejection", reason, p);
      log(
        `\n${c.red("unhandledRejection")} ${
          reason !== "" ? c.bold("named") : void ""
        } ${c.bold(reason)}
          `.replace(":", "")
      );
      //resumes the prompt after an unhandled rejection
      process.stdin.write(this.options.prompt);
    });
  }
  /**
   * adds a command
   * @param {string} name the name of the command
   * @param {string} description the description of the command
   * @param {(args: any) => void} exec the action of the command
   * @param {() => string} usage the usage of the command
   * @example
   * ```js
   * repl.addCommand("say", "says something", (args) => {
   * 	console.log(args)
   * 	}, () => {
   * 		return "say <something>"
   * 	}
   * });
   * ```
   * @returns {void}
   */
  addCommand(name, description, exec, usage) {
    this.commands[name] = {
      description,
      exec,
      usage
    };
  }
  /**
   * remove a command
   * @example
   * ```js
   * repl.removeCommand("say") // will remove the command "say"
   * ```
   * @param {string} name the name of the command to remove
   */
  removeCommand(name) {
    if (this.commands[name]) delete this.commands[name];
  }
  /**
   * set a option
   * @param {Partial<options>} keys
   * @example
   * ```js
   * repl.set({
   *  prompt: "> ",
   *  name: "my-repl",
   *  version: "1.0.0",
   *  description: "my description"
   * });
   * ```
   * @returns {void}
   */
  set(keys) {
    Object.keys(keys).forEach((name) => {
      var value = keys[name];
      //@ts-ignore
      if (name === "prompt") {
        readline.clearLine(process.stdin, 0);
        readline.cursorTo(process.stdin, 0);
        this.options["prompt"] = value;
        process.stdin.write(value);
        //@ts-ignore
      } else this.options[name] = value;
    });
  }
  /**
   * get a option
   * @example
   * ```js
   * repl.get("prompt") // will return the prompt
   * ```
   * @param {optionsNames} name the name of the option
   * @returns {any} the value of the option
   */
  get(name) {
    if (!name) new utils.error({ message: "name of the option not specified" });
    return this.options[name];
  }
  /**
   * the readline used by creply
   * @example
   * ```js
   * repl.readline // will return the readline used by creply
   * ```
   * @returns {readline}
   */
  get readline() {
    return readline;
  }
}

module.exports = creply;