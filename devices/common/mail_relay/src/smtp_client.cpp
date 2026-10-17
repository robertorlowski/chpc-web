// Klient SMTP z STARTTLS (opis w smtp_client.hpp).
#include "smtp_client.hpp"

#include <Arduino.h>
#include <cerrno>
#include <lwip/netdb.h>
#include <lwip/sockets.h>
#include <mbedtls/base64.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/entropy.h>
#include <mbedtls/error.h>
#include <mbedtls/net_sockets.h>
#include <mbedtls/platform_util.h>
#include <mbedtls/ssl.h>
#include <mbedtls/x509_crt.h>

#include "smtp_roots.hpp"
#include "smtp_text.hpp"

namespace mail_relay {
namespace {

constexpr int SOCKET_TIMEOUT_S = 15;
constexpr size_t MAX_REPLY_LINE = 512;

// Połączenie: najpierw gołe gniazdo, po STARTTLS mbedtls na tym samym gnieździe.
class Session {
public:
  ~Session() { close(); }

  bool connect(const std::string &host, uint16_t port, std::string &error)
  {
    addrinfo hints = {};
    hints.ai_family = AF_INET;
    hints.ai_socktype = SOCK_STREAM;
    addrinfo *result = nullptr;
    const std::string service = std::to_string(port);
    if (lwip_getaddrinfo(host.c_str(), service.c_str(), &hints, &result) != 0 || result == nullptr) {
      error = "DNS: nie znaleziono " + host;
      return false;
    }
    fd = lwip_socket(result->ai_family, result->ai_socktype, result->ai_protocol);
    if (fd >= 0) {
      timeval timeout = {SOCKET_TIMEOUT_S, 0};
      lwip_setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
      lwip_setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    }
    const bool ok = fd >= 0 && lwip_connect(fd, result->ai_addr, result->ai_addrlen) == 0;
    lwip_freeaddrinfo(result);
    if (!ok) error = "połączenie z " + host + ":" + service + " nieudane (errno " + std::to_string(errno) + ")";
    return ok;
  }

  // STARTTLS: uzgodnienie TLS na otwartym gnieździe, certyfikat i nazwa hosta sprawdzane
  bool startTls(const std::string &host, std::string &error)
  {
    mbedtls_ssl_init(&ssl);
    mbedtls_ssl_config_init(&config);
    mbedtls_x509_crt_init(&roots);
    mbedtls_entropy_init(&entropy);
    mbedtls_ctr_drbg_init(&drbg);
    tlsInitialized = true;
    int code = mbedtls_ctr_drbg_seed(&drbg, mbedtls_entropy_func, &entropy, nullptr, 0);
    if (code == 0) code = mbedtls_x509_crt_parse(&roots, reinterpret_cast<const unsigned char *>(SMTP_ROOT_CAS), sizeof(SMTP_ROOT_CAS));
    if (code == 0) code = mbedtls_ssl_config_defaults(&config, MBEDTLS_SSL_IS_CLIENT, MBEDTLS_SSL_TRANSPORT_STREAM, MBEDTLS_SSL_PRESET_DEFAULT);
    if (code == 0) {
      mbedtls_ssl_conf_authmode(&config, MBEDTLS_SSL_VERIFY_REQUIRED);
      mbedtls_ssl_conf_ca_chain(&config, &roots, nullptr);
      mbedtls_ssl_conf_rng(&config, mbedtls_ctr_drbg_random, &drbg);
      code = mbedtls_ssl_setup(&ssl, &config);
    }
    if (code == 0) code = mbedtls_ssl_set_hostname(&ssl, host.c_str());
    if (code == 0) {
      net.fd = fd;
      mbedtls_ssl_set_bio(&ssl, &net, mbedtls_net_send, mbedtls_net_recv, nullptr);
      while ((code = mbedtls_ssl_handshake(&ssl)) == MBEDTLS_ERR_SSL_WANT_READ || code == MBEDTLS_ERR_SSL_WANT_WRITE) {}
    }
    if (code != 0) {
      const uint32_t flags = mbedtls_ssl_get_verify_result(&ssl);
      error = "TLS: błąd " + std::to_string(code) + (flags ? ", certyfikat odrzucony (0x" + hex(flags) + ")" : std::string());
      return false;
    }
    tls = true;
    return true;
  }

  bool write(const std::string &data)
  {
    size_t sent = 0;
    while (sent < data.size()) {
      int n = tls ? mbedtls_ssl_write(&ssl, reinterpret_cast<const unsigned char *>(data.data()) + sent, data.size() - sent)
                  : lwip_send(fd, data.data() + sent, data.size() - sent, 0);
      if (tls && (n == MBEDTLS_ERR_SSL_WANT_WRITE || n == MBEDTLS_ERR_SSL_WANT_READ)) continue;
      if (n <= 0) return false;
      sent += static_cast<size_t>(n);
    }
    return true;
  }

  // Jedna odpowiedź SMTP (także wieloliniowa); zwraca kod, a w last ostatnią linię (do komunikatu błędu).
  int reply(std::string &last)
  {
    std::string line;
    while (true) {
      char c;
      int n = tls ? mbedtls_ssl_read(&ssl, reinterpret_cast<unsigned char *>(&c), 1) : lwip_recv(fd, &c, 1, 0);
      if (tls && (n == MBEDTLS_ERR_SSL_WANT_READ || n == MBEDTLS_ERR_SSL_WANT_WRITE)) continue;
      if (n <= 0) {
        last = "brak odpowiedzi serwera";
        return 0;
      }
      if (c == '\r') continue;
      if (c != '\n') {
        if (line.size() < MAX_REPLY_LINE) line += c;
        continue;
      }
      if (smtpReplyLast(line)) {
        last = line;
        return smtpReplyCode(line);
      }
      line.clear();
    }
  }

  void close()
  {
    if (tls) mbedtls_ssl_close_notify(&ssl);
    if (tlsInitialized) {
      mbedtls_ssl_free(&ssl);
      mbedtls_ssl_config_free(&config);
      mbedtls_x509_crt_free(&roots);
      mbedtls_ctr_drbg_free(&drbg);
      mbedtls_entropy_free(&entropy);
      tlsInitialized = false;
    }
    tls = false;
    if (fd >= 0) lwip_close(fd);
    fd = -1;
  }

private:
  static std::string hex(uint32_t value)
  {
    char text[12];
    snprintf(text, sizeof(text), "%lx", static_cast<unsigned long>(value));
    return text;
  }

  int fd = -1;
  bool tls = false;
  bool tlsInitialized = false;
  mbedtls_net_context net = {-1};
  mbedtls_ssl_context ssl;
  mbedtls_ssl_config config;
  mbedtls_x509_crt roots;
  mbedtls_entropy_context entropy;
  mbedtls_ctr_drbg_context drbg;
};

std::string base64(const std::string &text)
{
  size_t length = 0;
  std::string out(((text.size() + 2) / 3) * 4 + 1, '\0');
  mbedtls_base64_encode(reinterpret_cast<unsigned char *>(&out[0]), out.size(), &length,
    reinterpret_cast<const unsigned char *>(text.data()), text.size());
  out.resize(length);
  return out;
}

// polecenie i oczekiwany kod odpowiedzi; przy innym kodzie error = „krok: odpowiedź”
bool step(Session &session, const char *name, const std::string &command, int expected, std::string &error, int alternative = 0)
{
  if (!command.empty() && !session.write(command)) {
    error = std::string(name) + ": błąd wysyłania";
    return false;
  }
  std::string last;
  const int code = session.reply(last);
  if (code == expected || (alternative && code == alternative)) return true;
  error = std::string(name) + ": " + last;
  return false;
}

}  // namespace

bool smtpSend(const SmtpSettings &settings, const std::string &from, const std::vector<std::string> &to,
  const std::string &raw, std::string &error)
{
  if (!safeAddress(from)) {
    error = "nieprawidłowy nadawca";
    return false;
  }
  for (const std::string &address : to) {
    if (!safeAddress(address)) {
      error = "nieprawidłowy adresat";
      return false;
    }
  }
  Session session;
  if (!session.connect(settings.host, settings.port, error)) return false;
  if (!step(session, "powitanie", "", 220, error)) return false;
  if (!step(session, "EHLO", "EHLO chpc\r\n", 250, error)) return false;
  if (!step(session, "STARTTLS", "STARTTLS\r\n", 220, error)) return false;
  if (!session.startTls(settings.host, error)) return false;
  if (!step(session, "EHLO po TLS", "EHLO chpc\r\n", 250, error)) return false;
  std::string user = base64(settings.user);
  std::string pass = base64(settings.pass);
  bool ok = step(session, "AUTH", "AUTH LOGIN\r\n", 334, error)
    && step(session, "AUTH użytkownik", user + "\r\n", 334, error)
    && step(session, "AUTH", pass + "\r\n", 235, error);
  mbedtls_platform_zeroize(&pass[0], pass.size());
  if (!ok) return false;
  if (!step(session, "MAIL FROM", "MAIL FROM:<" + from + ">\r\n", 250, error)) return false;
  for (const std::string &address : to) {
    if (!step(session, "RCPT TO", "RCPT TO:<" + address + ">\r\n", 250, error, 251)) return false;
  }
  if (!step(session, "DATA", "DATA\r\n", 354, error)) return false;
  if (!step(session, "treść", smtpData(raw), 250, error)) return false;
  session.write("QUIT\r\n");
  return true;
}

}  // namespace mail_relay
