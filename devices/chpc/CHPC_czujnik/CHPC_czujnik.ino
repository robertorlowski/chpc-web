#define EMERGENCY_PIN         A7
#define ADC_BITS 10                      //10 fo regular arduino
#define ADC_COUNTS (1<<ADC_BITS)

unsigned long millis_now;
int sample = 0;
double offsetI_1 = ADC_COUNTS>>1;	//Low-pass filter output

void setup(void) {
  Serial.begin(9600);
  pinMode	(EMERGENCY_PIN, INPUT);
}
 
void loop(void) {  
	millis_now = millis();
  sample = analogRead(EMERGENCY_PIN);
	// Digital low pass filter extracts the 2.5 V or 1.65 V dc offset, then subtract this - signal is now centered on 0 counts.
  sample = (sample /offsetI_1);
		// filteredI_1 = sampleI_1 - offsetI_1;

  Serial.println(sample);
  Serial.println(offsetI_1);
	delay(100);
}
