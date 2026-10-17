// Testy native przekaźnika poczty (od 1.3.0, devices/common/mail_relay/src/smtp_text.hpp): kody odpowiedzi SMTP
// (także wieloliniowe), treść DATA (CRLF, podwojona kropka, zakończenie), odcisk klucza jak na serwerze i adresy
// koperty bez wstrzyknięcia poleceń. Szyfrowanie i rozmowa sieciowa (mbedtls, lwIP) są tylko na płytce;
// ich odpowiednik po stronie chmury testuje server/test/mail-relay.test.ts.
#include <unity.h>

#include <string>

#include "../../../common/mail_relay/src/smtp_text.hpp"

using namespace mail_relay;

void setUp() {}
void tearDown() {}

void test_reply_codes()
{
  TEST_ASSERT_EQUAL_INT(220, smtpReplyCode("220 BN0PR04CA0001.outlook.office365.com Microsoft ESMTP MAIL Service ready"));
  TEST_ASSERT_EQUAL_INT(250, smtpReplyCode("250-SIZE 157286400"));
  TEST_ASSERT_FALSE(smtpReplyLast("250-SIZE 157286400"));
  TEST_ASSERT_TRUE(smtpReplyLast("250 SMTPUTF8"));
  TEST_ASSERT_TRUE(smtpReplyLast("354"));
  TEST_ASSERT_EQUAL_INT(535, smtpReplyCode("535 5.7.139 Authentication unsuccessful"));
  TEST_ASSERT_EQUAL_INT(0, smtpReplyCode("ab1 nie kod"));
  TEST_ASSERT_EQUAL_INT(0, smtpReplyCode("25"));
}

void test_data_crlf_dot_stuffing_and_end()
{
  TEST_ASSERT_EQUAL_STRING("Subject: x\r\n\r\ntreść\r\n.\r\n", smtpData("Subject: x\r\n\r\ntreść").c_str());
  // sama kropka i kropka na początku linii są podwajane, w środku linii nie
  TEST_ASSERT_EQUAL_STRING("a\r\n..\r\n..b.c\r\n.\r\n", smtpData("a\n.\n.b.c\n").c_str());
  // kropka na samym początku wiadomości
  TEST_ASSERT_EQUAL_STRING("..start\r\n.\r\n", smtpData(".start").c_str());
  TEST_ASSERT_EQUAL_STRING(".\r\n", smtpData("").c_str());
}

void test_fingerprint_matches_server_format()
{
  const uint8_t digest[8] = {0x3f, 0x2a, 0x91, 0xc0, 0x7b, 0x5d, 0xe8, 0x14};
  TEST_ASSERT_EQUAL_STRING("3F2A-91C0-7B5D-E814", fingerprintText(digest).c_str());
}

void test_envelope_addresses()
{
  TEST_ASSERT_TRUE(safeAddress("robert@infotower.pl"));
  TEST_ASSERT_TRUE(safeAddress("EPR.Raporty@epruf.pl"));
  TEST_ASSERT_FALSE(safeAddress(""));
  TEST_ASSERT_FALSE(safeAddress("bez-malpy"));
  TEST_ASSERT_FALSE(safeAddress("a@b@c"));
  TEST_ASSERT_FALSE(safeAddress("x@y.pl>\r\nRCPT TO:<obcy@z.pl"));
  TEST_ASSERT_FALSE(safeAddress("x y@z.pl"));
  TEST_ASSERT_FALSE(safeAddress("@z.pl"));
}

int main(int, char **)
{
  UNITY_BEGIN();
  RUN_TEST(test_reply_codes);
  RUN_TEST(test_data_crlf_dot_stuffing_and_end);
  RUN_TEST(test_fingerprint_matches_server_format);
  RUN_TEST(test_envelope_addresses);
  return UNITY_END();
}
