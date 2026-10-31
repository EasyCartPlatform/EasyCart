import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Text, TextInput } from '@/components/text';
import { Icon } from '@/components/icon';
import { Badge, Button, Card, Loading, Notice, Screen } from '@/components/ui';
import { useToast } from '@/components/toast';
import { useSession } from '@/lib/session';
import { api, errorMessage } from '@/lib/api';
import { colors, radius, shadow, space, text } from '@/theme/theme';

const STORE_TYPES = [
  'Grocery & Supermarket',
  'Fashion & Apparel',
  'Electronics & Gadgets',
  'Health & Beauty',
  'Home & Living / Furniture',
  'Jewelry & Accessories',
  'Books & Stationery',
  'Artisanal & Handicrafts',
  'Restaurant & Food',
  'Bakery',
  'General Retail',
  'Others'
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

interface UploadedDoc {
  dataUrl: string;
  name: string;
  size?: string;
}

interface StoreRequestData {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'active' | 'rejected';
  created_at: string;
  store_description?: string;
  business_address?: string;
}

function toSlug(str: string) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function StoreRequestScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery<{ request: StoreRequestData | null }>({
    queryKey: ['my-store-request'],
    queryFn: () => api<{ request: StoreRequestData | null }>('/customers/store-request')
  });

  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState('');
  const [customStoreType, setCustomStoreType] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [description, setDescription] = useState('');

  // Business address fields
  const [line1, setLine1] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  // Document uploads
  const [idProof, setIdProof] = useState<UploadedDoc | null>(null);
  const [businessProof, setBusinessProof] = useState<UploadedDoc | null>(null);

  // Modals
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [stateModalOpen, setStateModalOpen] = useState(false);

  const isOther = storeType.toLowerCase().includes('other');

  function handleNameChange(val: string) {
    setStoreName(val);
    if (!slugEdited) {
      setSlug(toSlug(val));
    }
  }

  function handleSlugChange(val: string) {
    setSlugEdited(true);
    setSlug(toSlug(val));
  }

  async function pickDocument(kind: 'id' | 'business') {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.6,
        base64: true
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (!asset.base64) {
          toast('Could not read image file. Please try another.', 'error');
          return;
        }
        const mime = asset.mimeType ?? 'image/jpeg';
        const dataUrl = `data:${mime};base64,${asset.base64}`;
        const name = asset.fileName || (kind === 'id' ? 'id_proof.jpg' : 'business_proof.jpg');
        const size = asset.fileSize ? `${(asset.fileSize / (1024 * 1024)).toFixed(1)} MB` : undefined;

        if (kind === 'id') {
          setIdProof({ dataUrl, name, size });
        } else {
          setBusinessProof({ dataUrl, name, size });
        }
      }
    } catch (err) {
      toast(errorMessage(err, 'Failed to pick image'), 'error');
    }
  }

  const submit = useMutation({
    mutationFn: () => {
      const finalCategory = isOther ? customStoreType.trim() : storeType;
      return api('/customers/store-request', {
        method: 'POST',
        body: {
          store_name: storeName.trim(),
          slug: slug.trim(),
          store_type: finalCategory,
          store_description: description.trim(),
          business_address: {
            line1: line1.trim(),
            landmark: landmark.trim(),
            city: city.trim(),
            state: state.trim(),
            pincode: pincode.trim()
          },
          id_proof: idProof?.dataUrl,
          business_proof: businessProof?.dataUrl
        }
      });
    },
    onSuccess: () => {
      toast('Store request submitted to admin!', 'success');
      void queryClient.invalidateQueries({ queryKey: ['my-store-request'] });
    },
    onError: (err) => toast(errorMessage(err, 'Failed to submit request'), 'error')
  });

  function handleSubmit() {
    const finalCategory = isOther ? customStoreType.trim() : storeType;

    if (!storeName.trim()) return toast('Please enter a store name', 'error');
    if (!finalCategory) return toast('Please select a store category', 'error');
    if (!slug.trim()) return toast('Please enter a store URL slug', 'error');
    if (!description.trim()) return toast('Please describe your store purpose', 'error');
    if (!idProof) return toast('Please upload ID proof', 'error');
    if (!businessProof) return toast('Please upload business proof', 'error');
    if (line1.trim().length < 5) return toast('Street address must be at least 5 characters', 'error');
    if (city.trim().length < 2) return toast('Please enter city', 'error');
    if (!state.trim()) return toast('Please select state', 'error');
    if (pincode.trim().length !== 6) return toast('PIN code must be 6 digits', 'error');

    submit.mutate();
  }

  if (isLoading) return <Loading />;

  const request = data?.request;

  if (request && request.status === 'pending') {
    return (
      <Screen>
        <Card title="Store Application Status" icon="clock">
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={text.heading}>{request.name}</Text>
              <Badge tone="warning" label="Under Admin Review" />
            </View>

            <Text style={text.small}>
              Shop link: <Text style={{ fontWeight: '700', color: colors.primary }}>/{request.slug}</Text>
            </Text>

            <Notice tone="warning" icon="clock">
              Your application has been submitted and is currently being reviewed by the platform administrator. You will be able to access your store dashboard once approved.
            </Notice>

            <Button
              label="Back to Shop"
              variant="outline"
              icon="arrow-left"
              onPress={() => router.navigate('/shop')}
            />
          </View>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.formContainer}>
        {/* ROW 1: Store Name & Store Type */}
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>
              STORE NAME <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Organic Greens Market"
              placeholderTextColor="#94a3b8"
              value={storeName}
              onChangeText={handleNameChange}
            />
          </View>

          <View style={styles.col}>
            <Text style={styles.label}>
              STORE TYPE / CATEGORY <Text style={styles.required}>*</Text>
            </Text>
            <Pressable
              style={styles.selectButton}
              onPress={() => setCategoryModalOpen(true)}
            >
              <Text
                style={[
                  styles.selectText,
                  !storeType && { color: '#94a3b8' }
                ]}
                numberOfLines={1}
              >
                {storeType || 'Select a store category...'}
              </Text>
              <Icon name="chevron-down" size={18} color="#64748b" />
            </Pressable>
          </View>
        </View>

        {/* Optional Custom Category if Others chosen */}
        {isOther && (
          <View style={styles.customTypeBox}>
            <Text style={[styles.label, { color: '#0369a1' }]}>
              SPECIFY YOUR STORE TYPE / CATEGORY <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Pet Supplies, Hardware Store..."
              placeholderTextColor="#94a3b8"
              value={customStoreType}
              onChangeText={setCustomStoreType}
            />
          </View>
        )}

        {/* ROW 2: Store URL Slug */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            STORE URL SLUG <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.slugInputWrap}>
            <Text style={styles.slugPrefix}>easycart.com/</Text>
            <TextInput
              style={styles.slugInput}
              placeholder="organic-greens"
              placeholderTextColor="#94a3b8"
              value={slug}
              onChangeText={handleSlugChange}
              autoCapitalize="none"
            />
          </View>
          <Text style={styles.hint}>This will be your public storefront link.</Text>
        </View>

        {/* ROW 3: Store Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            STORE DESCRIPTION / PURPOSE <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder="Describe what your store is for (e.g. Selling fresh organic groceries, artisanal goods, clothing & accessories...)"
            placeholderTextColor="#94a3b8"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
          />
          <Text style={styles.hint}>
            Briefly explain what products or services your store will offer to customers.
          </Text>
        </View>

        {/* ROW 4: Document Uploads */}
        <View style={styles.row}>
          {/* ID Proof Box */}
          <View style={styles.col}>
            <Text style={styles.label}>
              ID PROOF (PDF OR IMAGE) <Text style={styles.required}>*</Text>
            </Text>
            {idProof ? (
              <View style={styles.uploadedBox}>
                <View style={styles.uploadedIcon}>
                  <Icon name="file-text" size={18} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadedName} numberOfLines={1}>{idProof.name}</Text>
                  {idProof.size ? <Text style={styles.uploadedSize}>{idProof.size}</Text> : null}
                </View>
                <Pressable onPress={() => setIdProof(null)} hitSlop={10} style={styles.removeBtn}>
                  <Icon name="x" size={16} color="#ef4444" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.uploadBox}
                onPress={() => void pickDocument('id')}
              >
                <Icon name="upload-cloud" size={24} color="#0284c7" />
                <Text style={styles.uploadTitle}>Click to upload (PDF or Image)</Text>
                <Text style={styles.uploadSubtitle}>PDF, Aadhaar, PAN, passport... · max 3MB</Text>
              </Pressable>
            )}
          </View>

          {/* Business Proof Box */}
          <View style={styles.col}>
            <Text style={styles.label}>
              BUSINESS PROOF (PDF OR IMAGE) <Text style={styles.required}>*</Text>
            </Text>
            {businessProof ? (
              <View style={styles.uploadedBox}>
                <View style={styles.uploadedIcon}>
                  <Icon name="file-text" size={18} color="#0284c7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.uploadedName} numberOfLines={1}>{businessProof.name}</Text>
                  {businessProof.size ? <Text style={styles.uploadedSize}>{businessProof.size}</Text> : null}
                </View>
                <Pressable onPress={() => setBusinessProof(null)} hitSlop={10} style={styles.removeBtn}>
                  <Icon name="x" size={16} color="#ef4444" />
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={styles.uploadBox}
                onPress={() => void pickDocument('business')}
              >
                <Icon name="upload-cloud" size={24} color="#0284c7" />
                <Text style={styles.uploadTitle}>Click to upload (PDF or Image)</Text>
                <Text style={styles.uploadSubtitle}>PDF, GST, licence, registration... · max 3MB</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* ROW 5: Business Address Card */}
        <View style={styles.addressCard}>
          <View style={styles.addressHeader}>
            <Icon name="map-pin" size={16} color="#0284c7" />
            <Text style={styles.addressTitle}>
              BUSINESS ADDRESS <Text style={styles.required}>*</Text>
            </Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>SHOP / BUILDING AND STREET</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Shop 12, Market Road"
              placeholderTextColor="#94a3b8"
              value={line1}
              onChangeText={setLine1}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              LANDMARK <Text style={styles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Near City Mall"
              placeholderTextColor="#94a3b8"
              value={landmark}
              onChangeText={setLandmark}
            />
          </View>

          <View style={styles.addressRow}>
            {/* City */}
            <View style={[styles.col, { flex: 1.2 }]}>
              <Text style={styles.label}>CITY</Text>
              <TextInput
                style={styles.input}
                placeholder="Hyderabad"
                placeholderTextColor="#94a3b8"
                value={city}
                onChangeText={setCity}
              />
            </View>

            {/* State */}
            <View style={[styles.col, { flex: 1.4 }]}>
              <Text style={styles.label}>STATE</Text>
              <Pressable
                style={styles.selectButton}
                onPress={() => setStateModalOpen(true)}
              >
                <Text
                  style={[
                    styles.selectText,
                    !state && { color: '#94a3b8' }
                  ]}
                  numberOfLines={1}
                >
                  {state || 'Select state'}
                </Text>
                <Icon name="chevron-down" size={16} color="#64748b" />
              </Pressable>
            </View>

            {/* PIN Code */}
            <View style={[styles.col, { flex: 1 }]}>
              <Text style={styles.label}>PIN CODE</Text>
              <TextInput
                style={styles.input}
                placeholder="500001"
                placeholderTextColor="#94a3b8"
                keyboardType="number-pad"
                maxLength={6}
                value={pincode}
                onChangeText={(v) => setPincode(v.replace(/\D/g, '').slice(0, 6))}
              />
            </View>
          </View>
        </View>

        {/* ROW 6: Applicant details Card */}
        <View style={styles.applicantCard}>
          <Text style={styles.applicantTitle}>Applicant details</Text>
          <View style={styles.applicantRow}>
            <Text style={styles.applicantText}>
              Username: <Text style={styles.applicantBold}>{user?.username ?? 'cust1'}</Text>
            </Text>
            <Text style={styles.applicantText}>
              Phone: <Text style={styles.applicantBold}>{user?.phone_number || '9833235223'}</Text>
            </Text>
          </View>
          <Text style={styles.applicantText}>
            Email: <Text style={styles.applicantBold}>{user?.email ?? 'cust1@gmail.com'}</Text>
          </Text>
        </View>

        {/* ROW 7: Submit Button */}
        <Pressable
          style={[styles.submitButton, submit.isPending && { opacity: 0.7 }]}
          disabled={submit.isPending}
          onPress={handleSubmit}
        >
          {submit.isPending ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <>
              <Icon name="store" size={18} color="#ffffff" />
              <Text style={styles.submitButtonText}>Submit store request to admin</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Category Modal Picker */}
      <Modal
        visible={categoryModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCategoryModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCategoryModalOpen(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Store Category</Text>
              <Pressable onPress={() => setCategoryModalOpen(false)} hitSlop={10}>
                <Icon name="x" size={20} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 380 }}>
              {STORE_TYPES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[
                    styles.modalOption,
                    storeType === cat && styles.modalOptionSelected
                  ]}
                  onPress={() => {
                    setStoreType(cat);
                    setCategoryModalOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      storeType === cat && styles.modalOptionTextSelected
                    ]}
                  >
                    {cat}
                  </Text>
                  {storeType === cat && <Icon name="check" size={18} color="#0284c7" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* State Modal Picker */}
      <Modal
        visible={stateModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setStateModalOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setStateModalOpen(false)}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select State</Text>
              <Pressable onPress={() => setStateModalOpen(false)} hitSlop={10}>
                <Icon name="x" size={20} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 380 }}>
              {INDIAN_STATES.map((st) => (
                <Pressable
                  key={st}
                  style={[
                    styles.modalOption,
                    state === st && styles.modalOptionSelected
                  ]}
                  onPress={() => {
                    setState(st);
                    setStateModalOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.modalOptionText,
                      state === st && styles.modalOptionTextSelected
                    ]}
                  >
                    {st}
                  </Text>
                  {state === st && <Icon name="check" size={18} color="#0284c7" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: space.lg,
    gap: space.lg,
    ...shadow
  },
  row: {
    flexDirection: 'row',
    gap: space.md,
    flexWrap: 'wrap'
  },
  col: {
    flex: 1,
    minWidth: 150,
    gap: 6
  },
  fieldGroup: {
    gap: 6
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  required: {
    color: '#ef4444'
  },
  optional: {
    fontWeight: '400',
    color: '#94a3b8',
    textTransform: 'none'
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#0f172a'
  },
  selectButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  selectText: {
    fontSize: 14,
    color: '#0f172a',
    flex: 1
  },
  customTypeBox: {
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 6
  },
  slugInputWrap: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center'
  },
  slugPrefix: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500'
  },
  slugInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
    paddingLeft: 2
  },
  hint: {
    fontSize: 11,
    color: '#64748b'
  },
  textArea: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#ffffff',
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    textAlignVertical: 'top'
  },
  uploadBox: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    gap: 4
  },
  uploadTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 4,
    textAlign: 'center'
  },
  uploadSubtitle: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center'
  },
  uploadedBox: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  uploadedIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  uploadedName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a'
  },
  uploadedSize: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2
  },
  removeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2'
  },
  addressCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 14,
    gap: 12
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2
  },
  addressTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: 0.5
  },
  addressRow: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap'
  },
  applicantCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 14,
    gap: 6
  },
  applicantTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2
  },
  applicantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm
  },
  applicantText: {
    fontSize: 12,
    color: '#475569'
  },
  applicantBold: {
    fontWeight: '600',
    color: '#0f172a'
  },
  submitButton: {
    minHeight: 50,
    backgroundColor: '#0284c7',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: space.lg,
    maxHeight: '75%',
    gap: space.md
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a'
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
    borderRadius: 10
  },
  modalOptionSelected: {
    backgroundColor: '#f0f9ff'
  },
  modalOptionText: {
    fontSize: 14,
    color: '#334155'
  },
  modalOptionTextSelected: {
    fontWeight: '700',
    color: '#0284c7'
  }
});
