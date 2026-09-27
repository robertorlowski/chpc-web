// Most łańcucha chpc <-> co: oryginalny kod co (operation_parser, operation_controller,
// modbus_frame, cop_estimator) + symulowany firmware CHPC. HTTP do chpc-web robi skrypt Node
// (run-e2e.mjs), który steruje mostem przez stdin/stdout, jedna komenda = jedna linia JSON odpowiedzi.
//
// Komendy: boot | run <ms> | poll | operation <json> | temp <nazwa> <°C> | connect <nazwa> <0|1>
//          power <W pracy> <W postoju> | flow <0|1> | state | lcd | quit
#include <ArduinoJson.h>
#include <cop_estimator.hpp>
#include <modbus_frame.hpp>
#include <operation_controller.hpp>
#include <operation_parser.hpp>

#include <cmath>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "bridge_api.h"

namespace {

// Kolejka jak SerialBus w co: polecenia bezpieczeństwa przed zwykłymi, ta sama komenda nie dubluje się.
class FrameSink : public CommandSink {
public:
  bool enqueue(SERIAL_OPERATION operation, double value = 0.0) override { return add(normal, operation, value); }
  bool enqueuePriority(SERIAL_OPERATION operation, double value = 0.0) override { return add(safety, operation, value); }

  // Wysyła kolejkę do sterownika z odstępem 600 ms (COMMAND_GAP_MS w co: 500 ms).
  std::vector<std::string> flush(std::vector<std::string> &events) {
    std::vector<std::string> sent;
    std::vector<Command> all = safety;
    all.insert(all.end(), normal.begin(), normal.end());
    safety.clear();
    normal.clear();
    for (const Command &c : all) {
      uint8_t frame[MODBUS_FRAME_CAPACITY];
      size_t length = encodeCommand(c.operation, c.value, frame, sizeof(frame));
      if (length == 0) continue;
      chpcSend(frame, length);
      char hex[32] = {0};
      for (size_t k = 0; k < length; k++) snprintf(hex + k * 3, 4, "%02x ", frame[k]);
      sent.push_back(std::string(hex, length * 3 - 1));
      std::string event = chpcRun(600);
      if (!event.empty()) events.push_back(event);
    }
    return sent;
  }

private:
  struct Command {
    SERIAL_OPERATION operation;
    double value;
  };
  std::vector<Command> safety, normal;

  static int key(SERIAL_OPERATION op) {
    switch (op) {
      case SET_HP_FORCE_ON: case SET_HP_FORCE_OFF: return 100;
      case SET_HP_CO_ON: case SET_HP_CO_OFF: return 101;
      case SET_SUMP_HEATER_ON: case SET_SUMP_HEATER_OFF: return 103;
      case SET_COLD_PUMP_ON: case SET_COLD_PUMP_OFF: return 104;
      case SET_HOT_PUMP_ON: case SET_HOT_PUMP_OFF: return 105;
      default: return 1000 + static_cast<int>(op);
    }
  }
  bool add(std::vector<Command> &queue, SERIAL_OPERATION op, double value) {
    for (std::vector<Command> *q : {&safety, &normal})
      for (size_t k = 0; k < q->size(); k++)
        if (key((*q)[k].operation) == key(op)) { q->erase(q->begin() + (long)k); break; }
    queue.push_back({op, value});
    return true;
  }
};

FrameSink sink;
OperationController controller(sink);
CopEstimator cop;
JsonDocument copFields;  // t_min, t_max, cop... jak Telemetry::updateHeatPump w co

double num(JsonVariantConst v) {
  if (v.is<const char *>()) return atof(v.as<const char *>());
  return v.as<double>();
}

void updateCop(JsonObjectConst hp) {
  if (hp["HPS"].isNull() || hp["Tho"].isNull() || hp["Ttarget"].isNull()) return;
  const bool running = hp["HPS"].as<int>() > 0;
  const double middle = num(hp["Ttarget"]);
  CopCycleEvent event = cop.update(running, num(hp["Tho"]), middle, num(hp["lt_pow"]),
                                   static_cast<uint32_t>(num(hp["lt_hp_on"])));
  if (event == CopCycleEvent::STARTED) {
    copFields["t_min"] = middle;
    copFields["t_max"] = middle;
    copFields.remove("cop");
    copFields.remove("cop_min");
    copFields.remove("cop_max");
    copFields.remove("cop_bottom_start");
  } else if (cop.cycleActive()) {
    copFields["t_max"] = cop.currentMiddleTemperature();
  } else if (event == CopCycleEvent::COMPLETED) {
    const CopEstimate &e = cop.estimate();
    copFields["t_min"] = e.startMiddleTemperature;
    copFields["t_max"] = e.endMiddleTemperature;
    copFields["cop_bottom_start"] = e.startBottomTemperature;
    if (e.valid) {
      copFields["cop_min"] = std::round(e.minimum * 100.0) / 100.0;
      copFields["cop_max"] = std::round(e.maximum * 100.0) / 100.0;
      copFields["cop"] = std::round(e.estimated * 100.0) / 100.0;
    }
  }
}

std::string quote(const std::string &s) {
  std::string r = "\"";
  for (char c : s) { if (c == '"' || c == '\\') r += '\\'; r += c; }
  return r + "\"";
}

}  // namespace

int main() {
  std::ios::sync_with_stdio(false);
  std::string line;
  while (std::getline(std::cin, line)) {
    if (!line.empty() && line.back() == '\r') line.pop_back();
    std::istringstream in(line);
    std::string command;
    in >> command;
    std::string reply = "{\"ok\":1}";

    if (command == "boot") {
      chpcBoot();
    } else if (command == "run") {
      uint64_t ms = 0;
      in >> ms;
      std::string event = chpcRun(ms);
      reply = "{\"ok\":1,\"event\":" + quote(event) + "}";
    } else if (command == "poll") {
      std::string hp = chpcPoll();
      if (hp.empty()) {
        reply = "{\"ok\":0,\"error\":\"no response\"}";
      } else {
        JsonDocument doc;
        DeserializationError err = deserializeJson(doc, hp);
        if (err) {
          reply = "{\"ok\":0,\"error\":\"hp_json_error\",\"raw\":" + quote(hp) + "}";
        } else {
          updateCop(doc.as<JsonObjectConst>());
          std::string copJson;
          serializeJson(copFields, copJson);
          reply = "{\"ok\":1,\"hp\":" + hp + ",\"cop\":" + (copJson == "null" ? std::string("{}") : copJson) + "}";
        }
      }
    } else if (command == "operation") {
      std::string json;
      std::getline(in, json);
      JsonDocument doc;
      deserializeJson(doc, json);
      OperationParseResult parsed = parseServerOperation(doc.as<JsonObjectConst>());
      controller.applyServerPatch(parsed.state);
      std::vector<std::string> events;
      std::vector<std::string> frames = sink.flush(events);
      std::string list = "[";
      for (size_t k = 0; k < frames.size(); k++) list += (k ? "," : "") + quote(frames[k]);
      list += "]";
      std::string ev = "[";
      for (size_t k = 0; k < events.size(); k++) ev += (k ? "," : "") + quote(events[k]);
      ev += "]";
      reply = "{\"ok\":1,\"invalid\":" + std::to_string(parsed.invalidValues) + ",\"frames\":" + list + ",\"events\":" + ev + "}";
    } else if (command == "temp") {
      std::string name;
      double v = 0;
      in >> name >> v;
      chpcSetTemp(name, v);
    } else if (command == "connect") {
      std::string name;
      int v = 1;
      in >> name >> v;
      chpcConnect(name, v != 0);
    } else if (command == "power") {
      double on = 1200, off = 0;
      in >> on >> off;
      chpcSetPower(on, off);
    } else if (command == "flow") {
      int v = 1;
      in >> v;
      chpcSetFlow(v != 0);
    } else if (command == "state") {
      reply = chpcState();
    } else if (command == "lcd") {
      reply = "{\"lcd\":" + quote(chpcLcd()) + "}";
    } else if (command == "quit") {
      std::cout << reply << std::endl;
      break;
    } else {
      reply = "{\"ok\":0,\"error\":\"unknown command\"}";
    }
    std::cout << reply << std::endl;
  }
  return 0;
}
